const http = require('http');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 4000);
const API_URL = (process.env.API_URL || 'http://backend:3000').replace(/\/$/, '');
const SYNC_INTERVAL_MS = Number(process.env.SYNC_INTERVAL_MS || 8000);
const TICK_INTERVAL_MS = Number(process.env.TICK_INTERVAL_MS || 120000);

const runtimeState = {
	paused: false,
	selectedTripId: null,
	lastSyncAt: null,
	lastTickAt: null,
	lastError: null,
	totalSent: 0,
	totalIncidents: 0,
	activeTrips: 0,
	simulations: [],
	logs: [],
	gateOpeningEnabled: true,
	turboMode: false,
};

const simulationMap = new Map();

function hashString(value) {
	let hash = 0;
	for (let index = 0; index < value.length; index += 1) {
		hash = (hash * 31 + value.charCodeAt(index)) % 2147483647;
	}
	return Math.abs(hash);
}

function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value));
}

function asNumber(value, fallback = 0) {
	const numberValue = Number(value);
	return Number.isFinite(numberValue) ? numberValue : fallback;
}

function parseRoutePoints(rutaWaypoints) {
	if (Array.isArray(rutaWaypoints)) {
		return rutaWaypoints
			.map((point) => ({ lat: asNumber(point.lat), lon: asNumber(point.lon) }))
			.filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon));
	}

	const coordinates = rutaWaypoints?.features?.[0]?.geometry?.coordinates;
	if (!Array.isArray(coordinates)) {
		return [];
	}

	return coordinates
		.map((point) => {
			if (!Array.isArray(point) || point.length < 2) {
				return null;
			}

			return { lon: asNumber(point[0]), lat: asNumber(point[1]) };
		})
		.filter(Boolean);
}

function createTripState(viaje) {
	const routePoints = parseRoutePoints(viaje.ruta_waypoints);
	const routeSeed = hashString(viaje.id);
	const temperatureBias = (routeSeed % 7) - 2;

	return {
		viajeId: viaje.id,
		routePoints,
		progressIndex: 0,
		progressStep: 0,
		direction: 1,
		telemetryCount: 0,
		incidentCount: 0,
		lastTelemetryAt: null,
		lastIncident: null,
		lastPayload: null,
		status: 'activo',
		battery: 100 - (routeSeed % 18),
		temperatureBias,
		routeSeed,
		history: [],
		compressorFailed: false,
		routeDeviated: false,
	};
}

function ensureTripState(viaje) {
	const existingState = simulationMap.get(viaje.id);
	const routePoints = parseRoutePoints(viaje.ruta_waypoints);

	if (!existingState) {
		const state = createTripState(viaje);
		simulationMap.set(viaje.id, state);
		return state;
	}

	existingState.routePoints = routePoints;
	existingState.status = 'activo';
	return existingState;
}

function getRoutePosition(state) {
	if (state.routePoints.length === 0) {
		return { lat: 13.6929, lon: -89.2182 };
	}

	if (state.routePoints.length === 1) {
		return state.routePoints[0];
	}

	const segmentStartIndex = clamp(state.progressIndex, 0, state.routePoints.length - 2);
	const start = state.routePoints[segmentStartIndex];
	const end = state.routePoints[segmentStartIndex + 1];
	const progress = clamp(state.progressStep, 0, 1);

	return {
		lat: start.lat + (end.lat - start.lat) * progress,
		lon: start.lon + (end.lon - start.lon) * progress,
	};
}

function advanceRouteState(state) {
	if (state.routePoints.length < 2) {
		return false;
	}

	const stepIncrement = runtimeState.turboMode ? 0.95 : 0.22;
	state.progressStep += stepIncrement;

	if (state.progressStep < 1) {
		return false;
	}

	state.progressStep = 0;
	state.progressIndex += state.direction;

	const maxIndex = state.routePoints.length - 1;
	if (state.progressIndex >= maxIndex) {
		state.progressIndex = maxIndex;
		return true; // Reached the destination
	}

	if (state.progressIndex <= 0) {
		state.progressIndex = 0;
		state.direction = 1;
	}

	return false;
}

function buildSample(viaje, state) {
	const routePosition = getRoutePosition(state);
	const limitMaxTemp = asNumber(viaje.limite_max_temp, 5);
	const limitMinTemp = viaje.limite_min_temp == null ? limitMaxTemp - 3 : asNumber(viaje.limite_min_temp, limitMaxTemp - 3);

	// Midpoint de la zona segura como temperatura objetivo
	const targetTemp = (limitMinTemp + limitMaxTemp) / 2;
	const ambientTemp = 28.0; // Temperatura exterior ambiental

	// Extraer temperatura anterior del estado, o usar targetTemp al inicio
	let temp = state.lastPayload ? state.lastPayload.temp : targetTemp;

	// Inicializar contador de ticks de compuerta abierta en el estado si no existe
	if (state.gateOpenTicks === undefined) {
		state.gateOpenTicks = 0;
	}

	// Evaluar probabilidad de apertura de compuerta (anomalía crítica) si está habilitada en UI
	if (runtimeState.gateOpeningEnabled !== false && state.gateOpenTicks === 0 && !state.compressorFailed) {
		const rand = Math.random();
		// Coeficiente probabilístico balanceado para evitar spam de alertas, especialmente en Modo Turbo
		const baseProbability = runtimeState.turboMode ? 0.0015 : 0.006;
		if (rand < baseProbability) {
			state.gateOpenTicks = 4; // La compuerta se mantendrá abierta por 4 ciclos
			logEvent('warn', `Simulador: Apertura de Compuerta detectada en viaje ${viaje.id}. Infiltración térmica externa activa.`, viaje.id);
		}
	}

	// Coeficientes de transferencia térmica realistas
	let heatTransferCoef = 0.02; // Coeficiente normal con contenedor sellado
	let coolingPower = 0.18;     // Poder de enfriamiento del compresor refrigerante

	if (state.compressorFailed) {
		coolingPower = 0.0;
		heatTransferCoef = 0.08; // Falla total de compresor, infiltración lenta constante
	}

	if (state.gateOpenTicks > 0) {
		// La compuerta está abierta: infiltración masiva de aire exterior cálido y compresor ineficiente
		heatTransferCoef = 0.35;
		if (!state.compressorFailed) {
			coolingPower = 0.02;
		}
		state.gateOpenTicks -= 1;
	}

	// Ley de enfriamiento de Newton y balance termodinámico:
	// CambioDeTemperatura = InfiltraciónCalorAmbiente + CapacidadRefrigeraciónCompresor + RuidoVibración
	const heatLeakage = (ambientTemp - temp) * heatTransferCoef;
	const coolingRestoration = (targetTemp - temp) * coolingPower;
	const noise = (Math.random() - 0.5) * 0.3; // Pequeña vibración estocástica

	temp += heatLeakage + coolingRestoration + noise;

	// Redondear temperatura a 1 decimal
	temp = Number(temp.toFixed(1));

	const humidity = Number(clamp(66 + Math.cos((state.telemetryCount + state.routeSeed) / 3.2) * 7, 35, 94).toFixed(1));
	const batteryDrain = state.routeSeed % 3 === 0 ? 1.8 : 0.9;
	const battery = Math.max(0, Math.min(100, Math.round(state.battery - batteryDrain)));

	// Calcular geolocalización con desvío opcional
	let finalLat = routePosition.lat;
	let finalLon = routePosition.lon;
	if (state.routeDeviated) {
		finalLat += 0.07;
		finalLon -= 0.05;
	}

	state.battery = battery;
	state.telemetryCount += 1;
	state.lastTelemetryAt = new Date().toISOString();
	state.lastPayload = {
		viaje_id: viaje.id,
		lat: Number(finalLat.toFixed(6)),
		lon: Number(finalLon.toFixed(6)),
		temp,
		humedad: humidity,
		bateria: battery,
		timestamp_sensor: state.lastTelemetryAt,
	};

	return {
		payload: state.lastPayload,
		temp,
		humidity,
		battery,
		routePosition: { lat: finalLat, lon: finalLon },
		limitMaxTemp,
		limitMinTemp,
		alertaTemperatura: temp > limitMaxTemp || temp < limitMinTemp,
		bateriaCritica: battery <= 10,
	};
}

async function postTelemetry(payload) {
	const response = await fetch(`${API_URL}/telemetria`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload),
	});

	const text = await response.text();
	let data = null;

	if (text) {
		try {
			data = JSON.parse(text);
		} catch {
			data = { raw: text };
		}
	}

	if (!response.ok) {
		const message = data?.message || text || 'No se pudo registrar la telemetría.';
		throw new Error(Array.isArray(message) ? message.join(', ') : message);
	}

	return data;
}

function logEvent(level, message, viajeId = null) {
	runtimeState.logs.unshift({
		id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
		level,
		message,
		viajeId,
		createdAt: new Date().toISOString(),
	});

	runtimeState.logs = runtimeState.logs.slice(0, 40);
}

function serializeState() {
	const simulations = [...simulationMap.values()].map((state) => ({
		viajeId: state.viajeId,
		routePoints: state.routePoints.length,
		progressIndex: state.progressIndex,
		progressStep: state.progressStep,
		direction: state.direction,
		telemetryCount: state.telemetryCount,
		incidentCount: state.incidentCount,
		lastTelemetryAt: state.lastTelemetryAt,
		lastIncident: state.lastIncident,
		lastPayload: state.lastPayload,
		battery: state.battery,
		status: state.status,
		history: state.history.slice(0, 12),
		compressorFailed: !!state.compressorFailed,
		routeDeviated: !!state.routeDeviated,
		gateOpenTicks: state.gateOpenTicks || 0,
	}));

	return {
		...runtimeState,
		simulations,
	};
}

function normalizeRoutePoints(rutaWaypoints) {
	if (Array.isArray(rutaWaypoints)) {
		return rutaWaypoints
			.map((point) => ({ lat: asNumber(point.lat), lon: asNumber(point.lon) }))
			.filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon));
	}

	const coordinates = rutaWaypoints?.features?.[0]?.geometry?.coordinates;
	if (!Array.isArray(coordinates)) {
		return [];
	}

	return coordinates
		.map((point) => {
			if (!Array.isArray(point) || point.length < 2) {
				return null;
			}

			return { lon: asNumber(point[0]), lat: asNumber(point[1]) };
		})
		.filter(Boolean);
}

async function fetchJson(url, options = {}) {
	const response = await fetch(url, options);
	const text = await response.text();
	let data = null;

	if (text) {
		try {
			data = JSON.parse(text);
		} catch {
			data = { raw: text };
		}
	}

	if (!response.ok) {
		const message = data?.message || text || `Error HTTP ${response.status}`;
		throw new Error(Array.isArray(message) ? message.join(', ') : message);
	}

	return data;
}

async function buildTripDetail(viajeId) {
	if (!viajeId) {
		return null;
	}

	try {
		const viaje = await fetchJson(`${API_URL}/viaje/${viajeId}`);
		const routePoints = normalizeRoutePoints(viaje.ruta_waypoints);
		let routePreview = null;

		if (routePoints.length >= 2) {
			try {
				routePreview = await fetchJson(`${API_URL}/viaje/ruta-preview`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ waypoints: routePoints }),
				});
			} catch (error) {
				routePreview = { geometry: routePoints.map((point) => [point.lon, point.lat]), osrm_usado: false, error: error instanceof Error ? error.message : 'fallback' };
			}
		}

		const telemetry = await fetchJson(`${API_URL}/telemetria/viaje/${viajeId}`);
		const telemetryRows = Array.isArray(telemetry) ? telemetry : [];
		const normalizedTelemetry = telemetryRows.map((row) => ({
			...row,
			lat: asNumber(row.lat),
			lon: asNumber(row.lon),
			temp: asNumber(row.temp),
			humedad: row.humedad == null ? null : asNumber(row.humedad),
			bateria: row.bateria == null ? null : asNumber(row.bateria),
		}));
		const latestTelemetry = normalizedTelemetry.at(-1) ?? null;
		const breachedCount = normalizedTelemetry.filter((row) => row.temp > asNumber(viaje.limite_max_temp, 0) || row.temp < asNumber(viaje.limite_min_temp, -999)).length;

		return {
			viaje: {
				...viaje,
				routePoints,
			},
			routePreview,
			telemetry: normalizedTelemetry,
			interpretation: {
				telemetryCount: normalizedTelemetry.length,
				breachedCount,
				latestTelemetry,
				previewMode: routePreview?.osrm_usado ? 'osrm' : 'fallback',
			},
		};
	} catch (error) {
		return {
			viaje: { id: viajeId },
			routePreview: null,
			telemetry: [],
			interpretation: {
				telemetryCount: 0,
				breachedCount: 0,
				latestTelemetry: null,
				previewMode: 'fallback',
			},
			error: error instanceof Error ? error.message : 'No se pudo construir el detalle del viaje.',
		};
	}
}

async function buildDashboardSnapshot() {
	const runtime = serializeState();
	const selectedTripId =
		runtimeState.selectedTripId && simulationMap.has(runtimeState.selectedTripId)
			? runtimeState.selectedTripId
			: runtime.simulations.find((trip) => trip.status === 'activo' || trip.status === 'alerta')?.viajeId
				?? runtime.simulations[0]?.viajeId
				?? null;

	if (selectedTripId && runtimeState.selectedTripId !== selectedTripId) {
		runtimeState.selectedTripId = selectedTripId;
	}

	const selectedDetail = await buildTripDetail(selectedTripId);

	return {
		...runtime,
		selectedTripId,
		selectedDetail,
	};
}

async function syncActiveTrips({ log = true } = {}) {
	try {
		const response = await fetch(`${API_URL}/viajes/en-curso`);
		if (!response.ok) {
			throw new Error(`Backend respondió ${response.status}`);
		}

		const viajes = await response.json();
		const activeTrips = Array.isArray(viajes) ? viajes : [];
		const activeIds = new Set(activeTrips.map((viaje) => viaje.id));

		activeTrips.forEach((viaje) => {
			ensureTripState(viaje);
		});

		for (const [viajeId, state] of simulationMap.entries()) {
			if (!activeIds.has(viajeId)) {
				state.status = 'pausado';
				state.lastInactiveAt = new Date().toISOString();
			}
		}

		runtimeState.activeTrips = activeTrips.length;
		runtimeState.lastSyncAt = new Date().toISOString();
		runtimeState.lastError = null;
		if (log) {
			logEvent('info', `Sincronizados ${activeTrips.length} viajes en curso.`);
		}

		if (activeTrips.length > 0) {
			if (!runtimeState.selectedTripId || !activeIds.has(runtimeState.selectedTripId)) {
				runtimeState.selectedTripId = activeTrips[0].id;
			}
		} else {
			runtimeState.selectedTripId = null;
		}

		return activeTrips;
	} catch (error) {
		runtimeState.lastError = error instanceof Error ? error.message : 'Error desconocido al sincronizar.';
		logEvent('error', runtimeState.lastError);
		return [];
	}
}

async function tickSimulation() {
	runtimeState.lastTickAt = new Date().toISOString();

	if (runtimeState.paused) {
		return;
	}

	const trips = await syncActiveTrips({ log: false });
	const ticks = trips.map(async (viaje) => {
		const state = ensureTripState(viaje);
		const sample = buildSample(viaje, state);

		try {
			const response = await postTelemetry(sample.payload);
			state.history.unshift({
				id: response.id || `${Date.now()}`,
				temp: sample.temp,
				battery: sample.battery,
				lat: sample.payload.lat,
				lon: sample.payload.lon,
				timestamp: response.received_at || sample.payload.timestamp_sensor,
				incidente_id: response.incidente_id || null,
				ia_diagnosis: response.ia_diagnosis || null,
			});
			state.history = state.history.slice(0, 12);
			state.lastPayload = sample.payload;
			state.lastIncident = response.incidente_id || null;
			state.incidentCount += response.incidente_id ? 1 : 0;
			runtimeState.totalSent += 1;
			runtimeState.totalIncidents += response.incidente_id ? 1 : 0;
			const reachedEnd = advanceRouteState(state);
			if (reachedEnd) {
				logEvent('info', `Simulador: Destino alcanzado para viaje ${viaje.id}. Finalizando...`, viaje.id);
				try {
					const finalizeRes = await fetch(`${API_URL}/viaje/${viaje.id}/finalizar`, {
						method: 'PATCH',
						headers: { 'Content-Type': 'application/json' }
					});
					if (finalizeRes.ok) {
						logEvent('success', `Simulador: Viaje ${viaje.id} finalizado exitosamente en el backend.`, viaje.id);
					} else {
						logEvent('error', `Simulador: Error al finalizar viaje ${viaje.id} (${finalizeRes.status}).`, viaje.id);
					}
				} catch (finalizeErr) {
					logEvent('error', `Simulador: Error de red al finalizar viaje ${viaje.id}: ${finalizeErr.message}`, viaje.id);
				}
				simulationMap.delete(viaje.id);
				if (runtimeState.selectedTripId === viaje.id) {
					runtimeState.selectedTripId = null;
				}
			}

			logEvent(
				response.incidente_id ? 'warn' : 'success',
				response.incidente_id
					? `Telemetría crítica enviada para ${viaje.id}`
					: `Telemetría enviada para ${viaje.id}`,
				viaje.id,
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'No se pudo enviar la telemetría.';
			state.status = 'error';
			state.lastError = message;
			logEvent('error', `${viaje.id}: ${message}`, viaje.id);
		}
	});

	await Promise.all(ticks);
}

function renderDashboardPage() {
	return String.raw`<!doctype html>
<html lang="es">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>Simulador maestro</title>
	<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
	<style>
		@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');

		:root {
			color-scheme: dark;
			--bg: #05070f;
			--panel: #0a0f1d;
			--panel-2: #121826;
			--line: #1e293b;
			--text: #f8fafc;
			--muted: #64748b;
			--cyan: #0ea5e9;
			--emerald: #10b981;
			--amber: #f59e0b;
			--rose: #ef4444;
			--indigo: #6366f1;
		}

		* { box-sizing: border-box; }
		
		/* Custom scrollbar styles */
		::-webkit-scrollbar {
			width: 5px;
			height: 5px;
		}
		::-webkit-scrollbar-track {
			background: transparent;
		}
		::-webkit-scrollbar-thumb {
			background: rgba(148, 163, 184, 0.12);
			border-radius: 99px;
		}
		::-webkit-scrollbar-thumb:hover {
			background: var(--cyan);
		}

		body {
			margin: 0;
			height: 100vh;
			background-color: var(--bg);
			background-image: 
				radial-gradient(at 50% 0%, rgba(14, 165, 233, 0.12) 0px, transparent 50%),
				radial-gradient(at 0% 100%, rgba(99, 102, 241, 0.05) 0px, transparent 40%),
				linear-gradient(rgba(255, 255, 255, 0.002) 1px, transparent 1px),
				linear-gradient(90deg, rgba(255, 255, 255, 0.002) 1px, transparent 1px);
			background-size: 100% 100%, 100% 100%, 32px 32px, 32px 32px;
			color: var(--text);
			font-family: 'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif;
			overflow: hidden;
			letter-spacing: -0.019em;
		}

		/* LED glow animation for active/inactive state */
		@keyframes led-glow-green {
			0% { box-shadow: 0 0 4px rgba(16, 185, 129, 0.4); opacity: 0.8; }
			50% { box-shadow: 0 0 12px rgba(16, 185, 129, 0.9); opacity: 1; }
			100% { box-shadow: 0 0 4px rgba(16, 185, 129, 0.4); opacity: 0.8; }
		}
		@keyframes led-glow-amber {
			0% { box-shadow: 0 0 4px rgba(245, 158, 11, 0.4); opacity: 0.8; }
			50% { box-shadow: 0 0 12px rgba(245, 158, 11, 0.9); opacity: 1; }
			100% { box-shadow: 0 0 4px rgba(245, 158, 11, 0.4); opacity: 0.8; }
		}
		.led-indicator {
			display: inline-block;
			width: 8px;
			height: 8px;
			border-radius: 50%;
			margin-right: 8px;
			vertical-align: middle;
		}
		.led-indicator.active {
			background: var(--emerald);
			animation: led-glow-green 2s infinite;
		}
		.led-indicator.paused {
			background: var(--amber);
			animation: led-glow-amber 2s infinite;
		}

		/* AI Diagnostic card styles */
		.ia-diagnosis-card {
			margin-top: 10px;
			padding: 12px 14px;
			background: rgba(10, 15, 29, 0.9);
			border: 1px solid rgba(16, 185, 129, 0.15);
			border-left: 3px solid var(--emerald);
			border-radius: 8px;
			color: #f1f5f9;
			font-size: 12px;
			line-height: 1.5;
			position: relative;
			overflow: hidden;
		}
		.ia-diagnosis-header {
			font-size: 10px;
			font-weight: 800;
			letter-spacing: 0.08em;
			text-transform: uppercase;
			color: #a7f3d0;
			margin-bottom: 6px;
			border-bottom: 1px solid rgba(16, 185, 129, 0.1);
			padding-bottom: 4px;
		}
		.ia-diagnosis-body {
			font-family: inherit;
			font-weight: 400;
			color: #e2e8f0;
			white-space: pre-wrap;
			word-wrap: break-word;
		}

		.topbar {
			height: 64px;
			background: rgba(10, 15, 29, 0.85);
			border-bottom: 1px solid rgba(255, 255, 255, 0.06);
			backdrop-filter: blur(16px);
			z-index: 30;
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding: 0 24px;
			transition: all 0.2s ease;
		}

		.shell {
			width: 100%;
			max-width: 1750px;
			margin: 0 auto;
			padding: 16px;
			display: grid;
			grid-template-columns: 340px minmax(0, 1fr) 400px;
			gap: 16px;
			height: calc(100vh - 64px);
			overflow: hidden;
		}

		.sidebar {
			display: flex;
			flex-direction: column;
			gap: 12px;
			height: 100%;
			min-height: 0;
		}

		.workspace-main {
			display: flex;
			flex-direction: column;
			gap: 12px;
			height: 100%;
			min-width: 0;
			min-height: 0;
		}

		.workspace-ai {
			display: flex;
			flex-direction: column;
			gap: 12px;
			height: 100%;
			min-height: 0;
		}

		.panel,
		.card,
		.stack-item {
			background: rgba(10, 15, 29, 0.7);
			border: 1px solid rgba(255, 255, 255, 0.06);
			border-radius: 16px;
			box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.02);
			backdrop-filter: blur(12px);
			transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
		}

		.panel { padding: 16px; min-height: 0; }
		
		.stack { 
			overflow-y: auto; 
			padding-right: 4px;
			display: flex;
			flex-direction: column;
			gap: 8px;
			min-height: 0;
			flex: 1;
			overscroll-behavior: contain; 
		}
		
		.stack-item {
			padding: 12px;
			cursor: pointer;
			background: rgba(18, 25, 41, 0.4);
			border: 1px solid rgba(255, 255, 255, 0.04);
			position: relative;
			border-radius: 12px;
		}
		.stack-item:hover {
			border-color: rgba(14, 165, 233, 0.25);
			background: rgba(18, 25, 41, 0.7);
			transform: translateY(-1px);
		}
		.stack-item.active {
			border-color: var(--cyan);
			background: rgba(14, 165, 233, 0.08);
			box-shadow: 0 0 15px rgba(14, 165, 233, 0.08);
		}

		.eyebrow {
			text-transform: uppercase;
			letter-spacing: 0.15em;
			font-size: 10px;
			color: var(--cyan);
			font-weight: 800;
		}

		.title {
			margin: 4px 0 0;
			font-size: 1.5rem;
			font-weight: 800;
			letter-spacing: -0.02em;
		}

		.muted { color: var(--muted); }

		.controls, .stat-grid {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 8px;
			margin-top: 12px;
		}

		.btn {
			border: 1px solid rgba(255, 255, 255, 0.06);
			background: rgba(15, 23, 42, 0.6);
			color: #e2e8f0;
			border-radius: 10px;
			padding: 8px 14px;
			font-weight: 600;
			cursor: pointer;
			transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
			display: inline-flex;
			align-items: center;
			justify-content: center;
			gap: 8px;
			font-size: 11px;
			text-transform: uppercase;
			letter-spacing: 0.05em;
		}
		.btn:hover {
			border-color: rgba(14, 165, 233, 0.4);
			background: rgba(15, 23, 42, 0.95);
			color: #ffffff;
			box-shadow: 0 4px 15px rgba(14, 165, 233, 0.1);
		}
		.btn:active {
			transform: translateY(1px);
		}
		.btn.primary {
			background: rgba(14, 165, 233, 0.15);
			border-color: rgba(14, 165, 233, 0.35);
			color: #38bdf8;
		}
		.btn.primary:hover {
			background: rgba(14, 165, 233, 0.25);
			border-color: #38bdf8;
			box-shadow: 0 4px 20px rgba(14, 165, 233, 0.2);
		}
		.btn.warn {
			background: rgba(239, 68, 68, 0.08);
			border-color: rgba(239, 68, 68, 0.3);
			color: #fca5a5;
		}
		.btn.warn:hover {
			background: rgba(239, 68, 68, 0.18);
			border-color: #ef4444;
			box-shadow: 0 4px 15px rgba(239, 68, 68, 0.15);
		}

		.tag {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			border-radius: 99px;
			padding: 4px 10px;
			font-size: 10px;
			font-weight: 800;
			border: 1px solid rgba(255, 255, 255, 0.06);
			background: rgba(10, 15, 29, 0.85);
			text-transform: uppercase;
			letter-spacing: 0.05em;
		}

		.tag.activo { color: #86efac; border-color: rgba(16, 185, 129, 0.2); background: rgba(16, 185, 129, 0.05); }
		.tag.alerta { color: #fef08a; border-color: rgba(245, 158, 11, 0.2); background: rgba(245, 158, 11, 0.05); }
		.tag.error { color: #fca5a5; border-color: rgba(239, 68, 68, 0.2); background: rgba(239, 68, 68, 0.05); }
		.tag.pausado { color: #cbd5e1; border-color: rgba(148, 163, 184, 0.2); background: rgba(148, 163, 184, 0.05); }
		.tag.osrm { color: #93c5fd; border-color: rgba(14, 165, 233, 0.2); background: rgba(14, 165, 233, 0.05); }

		.card {
			padding: 16px;
			display: grid;
			gap: 12px;
			min-height: 0;
		}

		.metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
		.metric { padding: 12px; border-radius: 12px; background: rgba(15, 23, 42, 0.35); border: 1px solid rgba(255, 255, 255, 0.04); }
		.metric span { display: block; font-size: 9px; text-transform: uppercase; letter-spacing: 0.15em; color: var(--muted); font-weight: 700; }
		.metric strong { display: block; margin-top: 6px; font-size: 1.3rem; font-family: monospace; font-weight: 700; color: #fff; }

		.map-card, .chart-card, .feed-card {
			overflow: hidden;
			background: rgba(10, 15, 29, 0.7);
			border: 1px solid rgba(255, 255, 255, 0.06);
			border-radius: 16px;
			box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
			display: flex;
			flex-direction: column;
			min-height: 0;
		}

		.map-card {
			padding: 14px;
			flex-grow: 1;
			display: flex;
			flex-direction: column;
			min-height: 280px; /* Evita colapsos a 0 */
			position: relative;
		}
		.chart-card {
			padding: 14px;
			shrink: 0;
			height: 250px;
			display: flex;
			flex-direction: column;
			position: relative;
		}
		.feed-card {
			padding: 14px;
			flex-grow: 1;
			display: flex;
			flex-direction: column;
			min-height: 220px;
		}
		
		.chart-wrap {
			overflow-x: auto;
			overflow-y: hidden;
			min-height: 0;
			flex: 1;
			position: relative;
			background: #05070f;
			border-radius: 12px;
			border: 1px solid rgba(255, 255, 255, 0.04);
			overscroll-behavior: contain;
			display: block;
		}
		.chart-scroll {
			height: 100%;
			display: block;
		}

		.map-wrap {
			flex: 1;
			min-height: 0;
			position: relative;
			display: flex;
			flex-direction: column;
		}
		.map-shell {
			position: relative;
			flex: 1;
			width: 100%;
			border-radius: 12px;
			overflow: hidden;
			background: #05070f;
			border: 1px solid rgba(255, 255, 255, 0.04);
		}
		
		/* Custom Dark mode filter for Leaflet map */
		.leaflet-map {
			position: absolute;
			inset: 0;
			width: 100%;
			height: 100%;
		}
		.leaflet-container {
			filter: invert(96%) hue-rotate(185deg) brightness(85%) contrast(100%);
			background: #05070f !important;
		}
		.leaflet-tile-container {
			opacity: 0.85;
		}
		.leaflet-bar {
			border: none !important;
			box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4) !important;
		}
		.leaflet-bar a {
			background-color: #0b0f19 !important;
			border: 1px solid rgba(255, 255, 255, 0.06) !important;
			color: #94a3b8 !important;
			transition: all 0.2s ease;
		}
		.leaflet-bar a:hover {
			background-color: rgba(14, 165, 233, 0.15) !important;
			color: #38bdf8 !important;
			border-color: rgba(14, 165, 233, 0.3) !important;
		}

		.map-hud {
			position: absolute;
			top: 10px;
			left: 10px;
			right: 10px;
			z-index: 500;
			display: flex;
			justify-content: space-between;
			gap: 8px;
			pointer-events: none;
		}
		.map-hud .tag { pointer-events: auto; backdrop-filter: blur(10px); }
		
		.map-banner {
			position: absolute;
			left: 10px;
			bottom: 10px;
			z-index: 500;
			max-width: min(480px, calc(100% - 20px));
			padding: 8px 12px;
			border-radius: 10px;
			border: 1px solid rgba(255, 255, 255, 0.06);
			background: rgba(10, 15, 29, 0.85);
			backdrop-filter: blur(10px);
			font-size: 11px;
			color: var(--text);
		}
		.map-legend {
			position: absolute;
			right: 10px;
			bottom: 10px;
			z-index: 500;
			display: grid;
			gap: 4px;
			padding: 8px 12px;
			border-radius: 10px;
			border: 1px solid rgba(255, 255, 255, 0.06);
			background: rgba(10, 15, 29, 0.85);
			backdrop-filter: blur(10px);
			font-size: 11px;
			color: var(--text);
			max-width: min(220px, calc(100% - 20px));
		}
		.legend-row {
			display: flex;
			align-items: center;
			gap: 8px;
			white-space: nowrap;
		}
		.legend-dot {
			width: 8px;
			height: 8px;
			border-radius: 50%;
			flex: 0 0 auto;
		}
		.legend-dot.route { background: #7dd3fc; }
		.legend-dot.temp { background: #ef4444; }
		.legend-dot.battery { background: #f59e0b; }
		.legend-dot.current { background: #4cc9f0; }
		
		.map-fallback {
			position: absolute;
			inset: 0;
			display: flex;
			align-items: center;
			justify-content: center;
			text-align: center;
			padding: 18px;
			color: var(--muted);
			background: rgba(5, 7, 15, 0.6);
			z-index: 450;
		}

		.feed-list {
			overflow-y: auto;
			display: flex;
			flex-direction: column;
			gap: 8px;
			flex: 1;
			min-height: 0;
			overscroll-behavior: contain;
		}
		.feed-item {
			padding: 12px;
			border-radius: 12px;
			background: rgba(15, 23, 42, 0.3);
			border: 1px solid rgba(255, 255, 255, 0.04);
			transition: all 0.2s ease;
		}
		.feed-item:hover {
			border-color: rgba(255, 255, 255, 0.08);
			background: rgba(15, 23, 42, 0.45);
		}
		.feed-item strong { display: block; font-size: 12px; color: #fff; }
		.feed-item small { display: block; margin-top: 4px; color: var(--muted); font-size: 10px; }

		.empty {
			padding: 20px;
			border-radius: 12px;
			border: 1px dashed rgba(255, 255, 255, 0.06);
			color: var(--muted);
			background: rgba(10, 15, 29, 0.3);
			text-align: center;
			font-size: 11px;
			font-family: inherit;
			height: 100%;
			display: flex;
			align-items: center;
			justify-content: center;
		}

		/* Premium custom styled switches */
		.switch {
			position: relative;
			display: inline-block;
			width: 42px;
			height: 22px;
			flex: 0 0 auto;
		}
		.switch input {
			opacity: 0;
			width: 0;
			height: 0;
		}
		.slider {
			position: absolute;
			cursor: pointer;
			inset: 0;
			background-color: rgba(255, 255, 255, 0.06);
			transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
			border-radius: 99px;
			border: 1px solid rgba(255, 255, 255, 0.04);
		}
		.slider:before {
			position: absolute;
			content: "";
			height: 14px;
			width: 14px;
			left: 3px;
			bottom: 3px;
			background-color: #64748b;
			transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
			border-radius: 50%;
			box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
		}
		.switch input:checked + .slider {
			background-color: rgba(14, 165, 233, 0.2);
			border-color: rgba(14, 165, 233, 0.4);
		}
		.switch input:checked + .slider:before {
			transform: translateX(20px);
			background-color: var(--cyan);
			box-shadow: 0 0 8px rgba(14, 165, 233, 0.6);
		}

		@media (max-width: 1400px) {
			.shell { grid-template-columns: 300px minmax(0, 1fr) 350px; gap: 12px; }
		}

		@media (max-width: 1120px) {
			body { overflow: auto; height: auto; }
			.shell { grid-template-columns: 1fr; height: auto; overflow: visible; }
			.sidebar, .workspace-main, .workspace-ai { height: auto; }
			.map-card { height: 400px; }
			.feed-card { height: 440px; }
		}

		/* Adaptabilidad para pantallas de poca altura (Vertical Media Queries) */
		@media (max-height: 800px) {
			body { overflow: auto; height: auto; }
			.shell { height: auto; overflow: visible; grid-template-columns: 340px minmax(0, 1fr) 400px; }
			@media (max-width: 1120px) {
				.shell { grid-template-columns: 1fr; }
			}
			.sidebar, .workspace-main, .workspace-ai { height: auto; }
			.map-card { height: 360px; }
			.feed-card { height: 400px; }
		}

		/* Adaptabilidad para pantallas extremadamente estrechas o móviles */
		@media (max-width: 768px) {
			.topbar {
				height: auto;
				padding: 12px 16px;
				flex-direction: column;
				gap: 12px;
				align-items: flex-start;
			}
			.topbar > div {
				width: 100%;
			}
			.topbar button {
				padding: 6px 10px;
				font-size: 10px;
			}
		}
	</style>
</head>
<body>
	<header class="topbar">
		<div>
			<div class="eyebrow" style="letter-spacing: 0.25em;">Consola de Operaciones</div>
			<div class="muted" id="connectionState" style="display:flex; align-items:center; font-size: 11px; font-weight: 600; margin-top: 2px;">
				<span class="led-indicator active" id="ledStatus"></span>
				<span id="connectionText">Conectando con backend...</span>
			</div>
		</div>
		<div style="display: flex; gap: 8px; align-items: center;">
			<button id="toggleBtn" class="btn primary">Pausar</button>
			<button id="stepBtn" class="btn">Forzar ciclo</button>
			<button id="syncBtn" class="btn">Sincronizar</button>
			<button id="openDashboardBtn" class="btn warn">Dashboard V2</button>
		</div>
	</header>

	<div class="shell">
		<!-- COLUMNA 1: CONTROL DE WORKER & LISTADO DE VIAJES (IZQUIERDA) -->
		<aside class="sidebar">
			<div class="panel">
				<div class="eyebrow" style="margin-bottom: 2px;">Simulación Global</div>
				<h1 class="title" style="font-size: 1.25rem; margin-bottom: 8px; color: #fff;">Consola de Worker</h1>
				
				<div class="stat-grid" style="grid-template-columns: repeat(2, 1fr); gap: 6px; margin-top: 8px;">
					<div class="metric" style="padding: 8px 10px;"><span style="font-size: 8px;">Sims Activas</span><strong id="activeTrips" style="font-size: 1.1rem; margin-top: 2px;">0</strong></div>
					<div class="metric" style="padding: 8px 10px;"><span style="font-size: 8px;">Total Ticks</span><strong id="sentTrips" style="font-size: 1.1rem; margin-top: 2px;">0</strong></div>
					<div class="metric" style="padding: 8px 10px;"><span style="font-size: 8px;">Anomalías</span><strong id="incidentTrips" style="font-size: 1.1rem; margin-top: 2px;">0</strong></div>
					<div class="metric" style="padding: 8px 10px;"><span style="font-size: 8px;">Última Sync</span><strong id="lastSync" style="font-size: 8px; font-family: monospace; margin-top: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">-</strong></div>
				</div>
				
				<!-- Global Simulation Speed / Turbo Control -->
				<div style="margin-top: 10px; padding: 10px 12px; border-radius: 10px; background: rgba(15, 23, 42, 0.3); border: 1px solid rgba(255, 255, 255, 0.04); display: flex; align-items: center; justify-content: space-between; gap: 10px;">
					<div>
						<div style="font-size: 11px; font-weight: 700; color: #e2e8f0;">Avance Rápido (Modo Turbo)</div>
						<div style="font-size: 9px; color: var(--muted); margin-top: 1px;">Ticks de 2s y saltos de tramo</div>
					</div>
					<label class="switch">
						<input type="checkbox" id="turboToggle">
						<span class="slider"></span>
					</label>
				</div>
				
				<!-- Probabilistic Gate Opening Toggle -->
				<div style="margin-top: 6px; padding: 10px 12px; border-radius: 10px; background: rgba(15, 23, 42, 0.3); border: 1px solid rgba(255, 255, 255, 0.04); display: flex; align-items: center; justify-content: space-between; gap: 10px;">
					<div>
						<div style="font-size: 11px; font-weight: 700; color: #e2e8f0;">Simulación de Compuerta</div>
						<div style="font-size: 9px; color: var(--muted); margin-top: 1px;">Aperturas físicas automáticas</div>
					</div>
					<label class="switch">
						<input type="checkbox" id="gateToggle" checked>
						<span class="slider"></span>
					</label>
				</div>
			</div>
			
			<div class="panel" style="flex: 1; display: flex; flex-direction: column; min-height: 0; padding-bottom: 12px;">
				<div class="eyebrow" style="margin-bottom: 4px;">Monitoreo de Flota</div>
				<span style="font-size: 11px; color: var(--muted); display: block; margin-bottom: 8px;">Selecciona una ruta en curso para auditar</span>
				<div class="stack" id="tripList"></div>
			</div>
			
			<div class="panel" style="padding: 10px 14px; shrink: 0; background: rgba(15, 23, 42, 0.25);">
				<div class="muted font-mono" id="statusText" style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 6px;">
					Esperando estado...
				</div>
			</div>
		</aside>

		<!-- COLUMNA 2: GEOMETRÍA Y TERMODINÁMICA (CENTRAL - FLEX-1) -->
		<section class="workspace-main">
			<!-- Banner de Viaje Seleccionado -->
			<section class="card" style="padding:14px; shrink: 0;">
				<div style="display:flex; justify-content:space-between; gap:12px; align-items:center; flex-wrap:wrap;">
					<div style="min-width: 0; flex: 1;">
						<div class="eyebrow" style="letter-spacing:0.2em; font-size: 9px;">Geometría & Ruta en Tiempo Real</div>
						<h2 style="margin:4px 0 0; font-size:1.15rem; font-weight:800; color:#fff; font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" id="selectedTitle">Sin viaje seleccionado</h2>
						<p class="muted" id="selectedSubtitle" style="margin:4px 0 0; font-size:11px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">La telemetría aparecerá aquí al seleccionar un viaje activo.</p>
					</div>
					<div style="display:flex; gap:6px; flex-shrink: 0;">
						<span class="tag osrm" id="previewTag">OSRM</span>
						<span class="tag" id="stateTag">activo</span>
					</div>
				</div>
			</section>

			<!-- Mapa OSRM Leaflet -->
			<section class="map-card">
				<div style="display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:8px;">
					<div>
						<div class="eyebrow" style="font-size: 9px;">Mapa de Ruta Activa</div>
						<div class="muted" style="font-size:10px;">Posicionamiento OSRM y avance en tiempo real</div>
					</div>
					<div class="tag" id="routeSourceTag" style="font-size: 9px;">fallback</div>
				</div>
				<div class="map-wrap" id="mapWrap">
					<div class="empty">Selecciona un viaje para ver la ruta interactiva.</div>
				</div>
			</section>

			<!-- Gráfica Térmica -->
			<section class="chart-card">
				<div style="display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:8px;">
					<div>
						<div class="eyebrow" style="font-size: 9px;">Historial Térmico de Sensor</div>
						<div class="muted" style="font-size:10px;">Curva del sensor térmico físico y zona ideal de carga</div>
					</div>
					<div class="tag" id="rangeTag" style="font-size: 9px;">Zona segura</div>
				</div>
				<div class="chart-wrap" id="chartWrap">
					<div class="empty">Sin telemetría para trazar gráfica.</div>
				</div>
			</section>
		</section>

		<!-- COLUMNA 3: COGNICIÓN E INTEGRACIÓN IA (DERECHA) -->
		<aside class="workspace-ai">
			<!-- Telemetría actual instantánea -->
			<section class="card" style="padding:14px; shrink: 0;">
				<div class="eyebrow" style="color:var(--emerald); margin-bottom:8px; font-size: 9px; letter-spacing: 0.2em;">Métricas Instantáneas</div>
				<div class="metrics" style="grid-template-columns: repeat(2, 1fr); gap: 8px;">
					<div class="metric">
						<span>Temperatura</span>
						<strong id="tempNow">-</strong>
					</div>
					<div class="metric">
						<span>Humedad</span>
						<strong id="humidityNow">-</strong>
					</div>
					<div class="metric">
						<span>Batería</span>
						<strong id="batteryNow">-</strong>
					</div>
					<div class="metric">
						<span>Lecturas</span>
						<strong id="telemetryCount">-</strong>
					</div>
				</div>
			</section>

			<!-- Selected Trip Manual Incident Triggers -->
			<div class="panel" style="shrink: 0; padding: 14px;">
				<div class="eyebrow" style="margin-bottom: 8px; font-size: 9px; letter-spacing: 0.2em;">Inyector de Anomalías</div>
				
				<div style="padding: 8px 12px; border-radius: 8px; background: rgba(15, 23, 42, 0.35); border: 1px solid rgba(255,255,255,0.04); display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
					<span style="font-size: 11px; font-weight: 700; color: #cbd5e1;">Falla de Compresor</span>
					<label class="switch">
						<input type="checkbox" id="compressorToggle">
						<span class="slider"></span>
					</label>
				</div>
				
				<div style="padding: 8px 12px; border-radius: 8px; background: rgba(15, 23, 42, 0.35); border: 1px solid rgba(255,255,255,0.04); display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
					<span style="font-size: 11px; font-weight: 700; color: #cbd5e1;">Desvío de Ruta (GPS)</span>
					<label class="switch">
						<input type="checkbox" id="deviationToggle">
						<span class="slider"></span>
					</label>
				</div>
				
				<button id="forceGateBtn" class="btn" style="width: 100%; margin-top: 4px; padding: 7px 12px; font-size: 10px; font-weight: 700; border-radius: 8px; background: rgba(148, 163, 184, 0.08); border: 1px solid rgba(255,255,255,0.06); color: #cbd5e1; cursor: pointer;">
					Simular Apertura de Compuerta (Manual)
				</button>
			</div>

			<!-- Alertas y diagnósticos de Zep & Groq -->
			<section class="feed-card">
				<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap; margin-bottom:10px;">
					<div>
						<div class="eyebrow" style="font-size: 9px;">Línea de Eventos (IA)</div>
						<div class="muted" id="backendSummary" style="font-size:10px; margin-top: 2px;">Sin información disponible.</div>
					</div>
					<div class="muted font-mono" id="lastTick" style="font-size:9px; font-weight: 600;">Sin tick aún.</div>
				</div>
				<div class="feed-list" id="feedList">
					<div class="empty">Esperando telemetría...</div>
				</div>
			</section>
		</aside>
	</div>


	<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
	<script>
		function toggleGuide() {
			const content = document.getElementById('guideContent');
			const arrow = document.getElementById('guideArrow');
			if (content && arrow) {
				if (content.style.display === 'none') {
					content.style.display = 'grid';
					arrow.style.transform = 'rotate(180deg)';
				} else {
					content.style.display = 'none';
					arrow.style.transform = 'rotate(0deg)';
				}
			}
		}

		const apiStateUrl = '/api/state';
		const toggleBtn = document.getElementById('toggleBtn');
		const gateToggle = document.getElementById('gateToggle');
		const turboToggle = document.getElementById('turboToggle');
		const compressorToggle = document.getElementById('compressorToggle');
		const deviationToggle = document.getElementById('deviationToggle');
		const forceGateBtn = document.getElementById('forceGateBtn');
		const stepBtn = document.getElementById('stepBtn');
		const syncBtn = document.getElementById('syncBtn');
		const openDashboardBtn = document.getElementById('openDashboardBtn');
		const tripList = document.getElementById('tripList');
		const connectionState = document.getElementById('connectionState');
		const statusText = document.getElementById('statusText');
		const activeTrips = document.getElementById('activeTrips');
		const sentTrips = document.getElementById('sentTrips');
		const incidentTrips = document.getElementById('incidentTrips');
		const lastSync = document.getElementById('lastSync');
		const lastTick = document.getElementById('lastTick');
		const selectedTitle = document.getElementById('selectedTitle');
		const selectedSubtitle = document.getElementById('selectedSubtitle');
		const tempNow = document.getElementById('tempNow');
		const humidityNow = document.getElementById('humidityNow');
		const batteryNow = document.getElementById('batteryNow');
		const telemetryCount = document.getElementById('telemetryCount');
		const routeSourceTag = document.getElementById('routeSourceTag');
		const previewTag = document.getElementById('previewTag');
		const stateTag = document.getElementById('stateTag');
		const rangeTag = document.getElementById('rangeTag');
		const mapWrap = document.getElementById('mapWrap');
		const chartWrap = document.getElementById('chartWrap');
		const feedList = document.getElementById('feedList');
		const backendSummary = document.getElementById('backendSummary');
		let leafletMap = null;
		let leafletLayer = null;
		let leafletTripId = null;
		let leafletMapReady = false;
		let renderedMapTripId = null;
		let isUserInteractingMap = false;
		let lastRoutePoints = [];

		function escapeHtml(value) {
			return String(value ?? '')
				.replaceAll('&', '&amp;')
				.replaceAll('<', '&lt;')
				.replaceAll('>', '&gt;')
				.replaceAll('"', '&quot;')
				.replaceAll("'", '&#39;');
		}

		function formatDate(value) {
			if (!value) return '-';
			return new Date(value).toLocaleString();
		}

		function formatNumber(value, digits = 1) {
			return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '-';
		}

		function badgeClass(status) {
			if (status === 'alerta') return 'tag alerta';
			if (status === 'error') return 'tag error';
			if (status === 'pausado') return 'tag pausado';
			return 'tag activo';
		}

		function getRoutePoints(detail) {
			const preview = detail?.routePreview?.geometry;
			if (Array.isArray(preview) && preview.length > 1) {
				return preview.map(([lon, lat]) => ({ lon: Number(lon), lat: Number(lat) }));
			}
			return Array.isArray(detail?.viaje?.routePoints) ? detail.viaje.routePoints : [];
		}

		function getProgressPoint(points, simulation) {
			if (!Array.isArray(points) || points.length === 0) return null;
			if (points.length === 1) return points[0];

			const segmentIndex = Math.max(0, Math.min(points.length - 2, Number(simulation?.progressIndex || 0)));
			const start = points[segmentIndex];
			const end = points[segmentIndex + 1];
			const progress = Math.max(0, Math.min(1, Number(simulation?.progressStep || 0)));
			return {
				lon: start.lon + (end.lon - start.lon) * progress,
				lat: start.lat + (end.lat - start.lat) * progress,
			};
		}

		function getTelemetryAlerts(detail) {
			const telemetry = Array.isArray(detail?.telemetry) ? detail.telemetry : [];
			const minTemp = Number(detail?.viaje?.limite_min_temp ?? detail?.viaje?.limite_max_temp - 3 ?? 0);
			const maxTemp = Number(detail?.viaje?.limite_max_temp ?? 0);

			return telemetry
				.filter((row) => Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lon)))
				.map((row) => {
					const temp = Number(row.temp);
					const battery = row.bateria == null ? null : Number(row.bateria);
					const isTempAlert = Number.isFinite(temp) && (temp > maxTemp || temp < minTemp);
					const isBatteryAlert = battery != null && battery <= 10;

					return {
						...row,
						kind: isTempAlert ? 'temp' : isBatteryAlert ? 'battery' : null,
						label: isTempAlert ? 'Temperatura fuera de rango' : isBatteryAlert ? 'Batería baja' : null,
					};
				})
				.filter((row) => row.kind);
		}

		function getChartTelemetry(detail, simulation) {
			const backendTelemetry = Array.isArray(detail?.telemetry) ? detail.telemetry : [];
			if (backendTelemetry.length > 0) {
				return backendTelemetry;
			}

			const history = Array.isArray(simulation?.history) ? simulation.history : [];
			return history.map((entry, index) => ({
				id: entry.id || 'fallback-' + index,
				temp: asNumber(entry.temp),
				humedad: null,
				bateria: entry.battery == null ? null : asNumber(entry.battery),
				lat: asNumber(entry.lat),
				lon: asNumber(entry.lon),
				timestamp_sensor: entry.timestamp || null,
				ia_diagnosis: entry.ia_diagnosis || null,
			}));
		}

		function toSvgPoint(point, bounds, width, height, pad = 28) {
			const lonSpan = Math.max(bounds.maxLon - bounds.minLon, 0.0001);
			const latSpan = Math.max(bounds.maxLat - bounds.minLat, 0.0001);
			const x = pad + ((point.lon - bounds.minLon) / lonSpan) * (width - pad * 2);
			const y = height - pad - ((point.lat - bounds.minLat) / latSpan) * (height - pad * 2);
			return { x, y };
		}

		function computeBounds(points) {
			return points.reduce((acc, point) => ({
				minLon: Math.min(acc.minLon, point.lon),
				maxLon: Math.max(acc.maxLon, point.lon),
				minLat: Math.min(acc.minLat, point.lat),
				maxLat: Math.max(acc.maxLat, point.lat),
			}), { minLon: points[0].lon, maxLon: points[0].lon, minLat: points[0].lat, maxLat: points[0].lat });
		}

		function renderMap(detail, simulation) {
			const points = getRoutePoints(detail);
			if (points.length < 2) {
				return '<div class="empty">No hay geometría suficiente para dibujar la ruta.</div>';
			}
			const status = simulation?.status || detail?.viaje?.estado || 'activo';
			return '<div class="map-shell" style="position: relative;">'
				+ '<div class="map-hud">'
				+ '<span class="tag osrm">Mapa real · Arrastra y haz zoom</span>'
				+ '<span class="tag ' + (status === 'alerta' ? 'alerta' : 'activo') + '">' + escapeHtml(status) + '</span>'
				+ '</div>'
				+ '<div class="leaflet-map" id="leafletMap"></div>'
				+ '<button id="resetMapCam" style="display: none; position: absolute; bottom: 80px; right: 10px; z-index: 1000; background: rgba(19, 24, 36, 0.9); border: 1px solid var(--cyan); backdrop-filter: blur(10px); color: var(--cyan); font-weight: 700; padding: 10px 14px; border-radius: 14px; cursor: pointer; font-size: 12px; transition: transform 0.15s ease, background 0.15s ease; box-shadow: 0 4px 12px rgba(0,0,0,0.5);" onmouseover="this.style.transform=\'translateY(-1px)\'" onmouseout="this.style.transform=\'none\'">Volver al camión</button>'
				+ '<div class="map-banner" id="mapBanner"><strong>' + escapeHtml(status === 'alerta' ? 'Alerta térmica' : 'Ruta activa') + '.</strong> Usa la rueda o arrastra el mapa para inspeccionar la ruta.</div>'
				+ '<div class="map-legend" aria-label="Leyenda del mapa">'
				+ '<div class="legend-row"><span class="legend-dot route"></span>Ruta activa</div>'
				+ '<div class="legend-row"><span class="legend-dot current"></span>Posición actual</div>'
				+ '<div class="legend-row"><span class="legend-dot temp"></span>Temperatura alta</div>'
				+ '<div class="legend-row"><span class="legend-dot battery"></span>Batería baja</div>'
				+ '</div>'
				+ '<div class="map-fallback" id="mapFallback">Cargando mapa real… si no aparece, revisa la conexión al CDN.</div>'
				+ '</div>';
		}

		function updateInteractiveMap(detail, simulation) {
			if (!window.L) return;

			const points = getRoutePoints(detail);
			const mapElement = document.getElementById('leafletMap');
			const fallback = document.getElementById('mapFallback');
			const banner = document.getElementById('mapBanner');
			if (!mapElement || points.length < 2) return;

			const route = points.map((point) => [point.lat, point.lon]);
			const progressPoint = getProgressPoint(points, simulation) || points[0];
			const currentStatus = simulation?.status || detail?.viaje?.estado || 'activo';
			const alerts = getTelemetryAlerts(detail);

			if (!leafletMap || leafletMap.getContainer() !== mapElement) {
				if (leafletMap) {
					leafletMap.remove();
				}

				leafletMap = window.L.map(mapElement, {
					zoomControl: true,
					preferCanvas: true,
					scrollWheelZoom: true,
					dragging: true,
					doubleClickZoom: true,
				}).setView(route[0], 12);

				window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
					attribution: '&copy; OpenStreetMap contributors',
					maxZoom: 19,
				}).addTo(leafletMap);

				leafletLayer = window.L.layerGroup().addTo(leafletMap);
				leafletMapReady = true;
				leafletTripId = null;

				// Registrar listeners de interacción del usuario
				leafletMap.on('dragstart', () => {
					isUserInteractingMap = true;
					const resetBtn = document.getElementById('resetMapCam');
					if (resetBtn) resetBtn.style.display = 'block';
				});

				leafletMap.on('zoomstart', () => {
					isUserInteractingMap = true;
					const resetBtn = document.getElementById('resetMapCam');
					if (resetBtn) resetBtn.style.display = 'block';
				});
			}

			if (!leafletLayer) return;
			leafletLayer.clearLayers();

			// Actualizar última ruta para recentrar de forma manual
			lastRoutePoints = route;

			const bounds = window.L.latLngBounds(route);
			window.L.polyline(route, {
				color: '#7dd3fc',
				weight: 5,
				opacity: 0.95,
				lineCap: 'round',
				lineJoin: 'round',
			}).addTo(leafletLayer);

			window.L.circleMarker(route[0], {
				radius: 8,
				color: '#22c55e',
				weight: 3,
				fillColor: '#0f172a',
				fillOpacity: 1,
			}).bindTooltip('Origen', { sticky: true }).addTo(leafletLayer);

			window.L.circleMarker(route[route.length - 1], {
				radius: 8,
				color: '#ef4444',
				weight: 3,
				fillColor: '#0f172a',
				fillOpacity: 1,
			}).bindTooltip('Destino', { sticky: true }).addTo(leafletLayer);

			window.L.circleMarker([progressPoint.lat, progressPoint.lon], {
				radius: currentStatus === 'alerta' ? 12 : 9,
				color: currentStatus === 'alerta' ? '#ef4444' : '#4cc9f0',
				weight: 4,
				fillColor: '#020617',
				fillOpacity: 1,
			}).bindTooltip(currentStatus === 'alerta' ? 'Alerta térmica' : 'Posición actual', { sticky: true }).addTo(leafletLayer);

			alerts.forEach((alert) => {
				const isTempAlert = alert.kind === 'temp';
				window.L.circleMarker([Number(alert.lat), Number(alert.lon)], {
					radius: isTempAlert ? 10 : 9,
					color: isTempAlert ? '#ef4444' : '#f59e0b',
					weight: 3,
					fillColor: isTempAlert ? '#7f1d1d' : '#78350f',
					fillOpacity: 0.88,
				}).bindTooltip(alert.label + ' · ' + formatDate(alert.timestamp_sensor), { sticky: true }).addTo(leafletLayer);

				window.L.circleMarker([Number(alert.lat), Number(alert.lon)], {
					radius: isTempAlert ? 18 : 16,
					color: isTempAlert ? '#ef4444' : '#f59e0b',
					weight: 1,
					fillColor: isTempAlert ? '#ef4444' : '#f59e0b',
					fillOpacity: 0.12,
				}).addTo(leafletLayer);
			});

			if (currentStatus === 'alerta') {
				window.L.circleMarker([progressPoint.lat, progressPoint.lon], {
					radius: 20,
					color: '#ef4444',
					weight: 2,
					fillColor: '#ef4444',
					fillOpacity: 0.12,
				}).addTo(leafletLayer);
			}

			if (fallback) {
				fallback.style.display = 'none';
			}

			if (banner) {
				banner.innerHTML = currentStatus === 'alerta'
					? '<strong>Alerta térmica activa.</strong> La posición actual está resaltada en rojo.'
					: '<strong>Ruta activa.</strong> Puedes mover el mapa libremente sin que se recenterice.';
			}

			const selectedTripId = detail?.viaje?.id || null;
			if (selectedTripId && selectedTripId !== leafletTripId) {
				leafletMap.fitBounds(bounds.pad(0.2), { animate: true });
				leafletTripId = selectedTripId;
				isUserInteractingMap = false;
				const resetBtn = document.getElementById('resetMapCam');
				if (resetBtn) resetBtn.style.display = 'none';
			} else if (selectedTripId && leafletMapReady && !isUserInteractingMap) {
				if (!leafletMap.getBounds().contains(bounds)) {
					leafletMap.fitBounds(bounds.pad(0.1), { animate: false });
				}
			}
		}

		function renderChart(detail, simulation) {
			const telemetry = getChartTelemetry(detail, simulation);
			if (!telemetry.length) {
				return '<div class="empty">Sin telemetría histórica para graficar.</div>';
			}

			const minTemp = Number(detail?.viaje?.limite_min_temp ?? detail?.viaje?.limite_max_temp - 3 ?? 0);
			const maxTemp = Number(detail?.viaje?.limite_max_temp ?? 0);
			const temps = telemetry.map((point) => Number(point.temp));
			const low = Math.min(minTemp - 3, ...temps) - 1;
			const high = Math.max(maxTemp + 3, ...temps) + 1;
			const width = Math.max(1120, telemetry.length * 92);
			const height = 240;
			const pad = 34;

			const xStep = telemetry.length > 1 ? (width - pad * 2) / (telemetry.length - 1) : 0;
			const yScale = (temp) => height - pad - ((temp - low) / (high - low)) * (height - pad * 2);
			const xScale = (index) => pad + index * xStep;
			const linePoints = telemetry.map((point, index) => xScale(index).toFixed(1) + ',' + yScale(Number(point.temp)).toFixed(1)).join(' ');

			return '<div class="chart-scroll" style="width: ' + width + 'px; height: 100%;">'
				+ '<svg class="chart-svg" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none" role="img" aria-label="Gráfica térmica">'
				+ '<defs>'
				+ '<linearGradient id="safeZoneGrad" x1="0" y1="0" x2="0" y2="1">'
				+ '<stop offset="0%" stop-color="#10b981" stop-opacity="0.04"/>'
				+ '<stop offset="100%" stop-color="#10b981" stop-opacity="0.01"/>'
				+ '</linearGradient>'
				+ '</defs>'
				+ '<rect width="' + width + '" height="' + height + '" fill="#050811" />'
				+ '<rect x="' + pad + '" y="' + yScale(maxTemp) + '" width="' + (width - pad * 2) + '" height="' + (yScale(minTemp) - yScale(maxTemp)) + '" fill="url(#safeZoneGrad)" stroke="rgba(16,185,129,0.18)" stroke-width="1" stroke-dasharray="4 4" />'
				+ Array.from({ length: 5 }, (_, index) => '<line x1="' + pad + '" y1="' + (pad + index * ((height - pad * 2) / 4)) + '" x2="' + (width - pad) + '" y2="' + (pad + index * ((height - pad * 2) / 4)) + '" stroke="rgba(255, 255, 255, 0.03)" />').join('')
				+ '<line x1="' + pad + '" y1="' + yScale(minTemp) + '" x2="' + (width - pad) + '" y2="' + yScale(minTemp) + '" stroke="rgba(16,185,129,0.3)" stroke-width="1.5" />'
				+ '<line x1="' + pad + '" y1="' + yScale(maxTemp) + '" x2="' + (width - pad) + '" y2="' + yScale(maxTemp) + '" stroke="rgba(244,63,94,0.3)" stroke-width="1.5" />'
				+ '<polyline points="' + linePoints + '" fill="none" stroke="#0ea5e9" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />'
				+ telemetry.map((point, index) => {
					const temp = Number(point.temp);
					const x = xScale(index);
					const y = yScale(temp);
					const breach = temp > maxTemp || temp < minTemp || (point.bateria != null && Number(point.bateria) <= 10);
					return '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (breach ? 6 : 4) + '" fill="' + (breach ? '#f43f5e' : '#38bdf8') + '" stroke="#050811" stroke-width="1.5" />';
				}).join('')
				+ '</svg>'
				+ '</div>';
		}

		function renderFeed(detail) {
			const telemetry = Array.isArray(detail?.telemetry) ? detail.telemetry.slice().reverse() : [];
			if (!telemetry.length) {
				return '<div class="empty">El backend aún no ha devuelto telemetría para este viaje.</div>';
			}

			// Utilidad para convertir saltos de línea \n en etiquetas <br/>
			const formatNewlines = (text) => {
				return String(text ?? '').replaceAll('\n', '<br/>');
			};

			return telemetry.slice(0, 8).map((point) => {
				const breach = Number(point.temp) > Number(detail?.viaje?.limite_max_temp ?? 0) || Number(point.temp) < Number(detail?.viaje?.limite_min_temp ?? 0);
				
				const telemetryLine = '<div style="color: #94a3b8; font-size: 11px; margin-top: 4px; margin-bottom: 2px;">'
					+ 'Temp: ' + formatNumber(point.temp) + '°C · Hum: ' + formatNumber(point.humedad) + '% · Bat: ' + formatNumber(point.bateria, 0) + '%'
					+ '</div>';

				const iaBlock = point.ia_diagnosis
					? '<div class="ia-diagnosis-card">'
						+ '<div class="ia-diagnosis-header">'
						+ '<span>DIAGNÓSTICO AUTOMATIZADO DE INCIDENTE (IA)</span>'
						+ '</div>'
						+ '<div class="ia-diagnosis-body">'
						+ formatNewlines(escapeHtml(point.ia_diagnosis))
						+ '</div>'
						+ '</div>'
					: '';

				return '<div class="feed-item" style="margin-bottom: 10px; padding: 14px;">'
					+ '<div style="display:flex; justify-content:space-between; align-items: flex-start;">'
					+ '<strong>' + (breach ? 'Incidente detectado' : 'Telemetría recibida') + '</strong>'
					+ '<small style="color: var(--muted); font-size: 11px;">' + formatDate(point.timestamp_sensor) + '</small>'
					+ '</div>'
					+ telemetryLine
					+ iaBlock
					+ '</div>';
			}).join('');
		}

		function renderTrips(state) {
			const trips = Array.isArray(state?.simulations) ? state.simulations : [];
			if (!trips.length) {
				return '<div class="empty">No hay viajes en curso. Cuando el backend exponga viajes con estado en_curso aparecerán aquí.</div>';
			}

			return trips.map((trip) => {
				const status = trip.status || 'activo';
				const lastPayload = trip.lastPayload || {};
				return '<div class="stack-item ' + (state.selectedTripId === trip.viajeId ? 'active' : '') + '" data-trip-id="' + escapeHtml(trip.viajeId) + '">'
					+ '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">'
					+ '<div>'
					+ '<div class="eyebrow">' + escapeHtml(trip.viajeId) + '</div>'
					+ '<div style="margin-top:6px;font-weight:800;">' + escapeHtml(trip.status === 'alerta' ? 'Viaje en alerta' : 'Viaje en simulación') + '</div>'
					+ '<div class="muted" style="margin-top:4px;font-size:12px;">Temp ' + formatNumber(lastPayload.temp) + '°C · Bat ' + formatNumber(lastPayload.bateria, 0) + '%</div>'
					+ '</div>'
					+ '<span class="' + badgeClass(status) + '">' + escapeHtml(status) + '</span>'
					+ '</div>'
					+ '</div>';
			}).join('');
		}

		async function postJson(path, body) {
			const response = await fetch(path, {
				method: body ? 'POST' : 'POST',
				headers: body ? { 'Content-Type': 'application/json' } : undefined,
				body: body ? JSON.stringify(body) : undefined,
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(data?.message || 'No se pudo completar la acción.');
			}
			return data;
		}

		function updatePage(state) {
			if (gateToggle) {
				gateToggle.checked = state.gateOpeningEnabled !== false;
			}
			if (turboToggle) {
				turboToggle.checked = !!state.turboMode;
			}
			activeTrips.textContent = state.activeTrips ?? 0;
			sentTrips.textContent = state.totalSent ?? 0;
			incidentTrips.textContent = state.totalIncidents ?? 0;
			lastSync.textContent = formatDate(state.lastSyncAt);
			lastTick.textContent = state.lastTickAt ? 'Último tick: ' + formatDate(state.lastTickAt) : 'Sin tick aún.';
			statusText.textContent = state.paused ? 'Simulación pausada' : 'Simulación activa';
			
			const led = document.getElementById('ledStatus');
			const connText = document.getElementById('connectionText');
			if (led && connText) {
				if (state.paused) {
					led.className = 'led-indicator paused';
					connText.textContent = 'Worker detenido';
				} else {
					led.className = 'led-indicator active';
					connText.textContent = 'Worker ejecutándose';
				}
			} else {
				connectionState.textContent = state.paused ? 'Worker detenido' : 'Worker ejecutándose';
			}
			
			toggleBtn.textContent = state.paused ? 'Reanudar' : 'Pausar';

			tripList.innerHTML = renderTrips(state);

			const detail = state.selectedDetail;
			const simulation = (state.simulations || []).find((trip) => trip.viajeId === state.selectedTripId) || null;

			if (!detail || !detail.viaje?.id) {
				selectedTitle.textContent = 'Sin viaje seleccionado';
				selectedSubtitle.textContent = 'Selecciona un viaje para ver mapa, telemetría y señales OSRM.';
				mapWrap.innerHTML = '<div class="empty">Sin viaje seleccionado.</div>';
				renderedMapTripId = null;
				chartWrap.innerHTML = '<div class="empty">Sin telemetría.</div>';
				chartWrap.removeAttribute('data-fingerprint');
				feedList.innerHTML = '<div class="empty">Sin datos.</div>';
				feedList.removeAttribute('data-fingerprint');
				backendSummary.textContent = 'Sin detalle disponible.';
				telemetryCount.textContent = '-';
				stateTag.textContent = 'sin datos';
				routeSourceTag.textContent = 'fallback';
				previewTag.textContent = 'OSRM';
				
				if (compressorToggle) {
					compressorToggle.checked = false;
					compressorToggle.disabled = true;
				}
				if (deviationToggle) {
					deviationToggle.checked = false;
					deviationToggle.disabled = true;
				}
				if (forceGateBtn) {
					forceGateBtn.disabled = true;
				}
				return;
			}

			const viaje = detail.viaje;
			const interp = detail.interpretation || {};
			selectedTitle.textContent = viaje.id;
			selectedSubtitle.textContent = (viaje.tipo_producto || 'Carga') + ' · ' + (viaje.estado || 'en_curso') + ' · ' + (viaje.origen_sucursal_nombre || 'Origen') + ' -> ' + (viaje.destino_sucursal_nombre || 'Destino');
			tempNow.textContent = formatNumber(simulation?.lastPayload?.temp ?? interp.latestTelemetry?.temp);
			humidityNow.textContent = formatNumber(simulation?.lastPayload?.humedad ?? interp.latestTelemetry?.humedad);
			batteryNow.textContent = formatNumber(simulation?.lastPayload?.bateria ?? interp.latestTelemetry?.bateria, 0);
			telemetryCount.textContent = String(interp.telemetryCount ?? 0);
			stateTag.textContent = simulation?.status || viaje.estado || 'activo';
			stateTag.className = badgeClass(simulation?.status || viaje.estado || 'activo');
			routeSourceTag.textContent = interp.previewMode === 'osrm' ? 'OSRM' : 'fallback';
			routeSourceTag.className = interp.previewMode === 'osrm' ? 'tag osrm' : 'tag';
			previewTag.textContent = interp.previewMode === 'osrm' ? 'Ruta OSRM' : 'Ruta fallback';
			previewTag.className = interp.previewMode === 'osrm' ? 'tag osrm' : 'tag';
			rangeTag.textContent = 'Zona ' + formatNumber(viaje.limite_min_temp) + '°C a ' + formatNumber(viaje.limite_max_temp) + '°C';

			if (compressorToggle) {
				compressorToggle.checked = !!simulation?.compressorFailed;
				compressorToggle.disabled = false;
			}
			if (deviationToggle) {
				deviationToggle.checked = !!simulation?.routeDeviated;
				deviationToggle.disabled = false;
			}
			if (forceGateBtn) {
				forceGateBtn.disabled = false;
			}

			if (renderedMapTripId !== viaje.id) {
				mapWrap.innerHTML = renderMap(detail, simulation);
				renderedMapTripId = viaje.id;
			}
			
			// Evitar parpadeo del historial térmico y feed re-renderizando únicamente ante cambios reales en la telemetría
			const telemetry = getChartTelemetry(detail, simulation);
			const telemetryFingerprint = viaje.id + '_' + telemetry.length + '_' + (telemetry.length > 0 ? telemetry[telemetry.length - 1].timestamp_sensor + '_' + telemetry[telemetry.length - 1].temp : '');
			if (chartWrap.getAttribute('data-fingerprint') !== telemetryFingerprint) {
				chartWrap.innerHTML = renderChart(detail, simulation);
				chartWrap.setAttribute('data-fingerprint', telemetryFingerprint);
			}

			const feedTelemetry = Array.isArray(detail?.telemetry) ? detail.telemetry : [];
			const feedFingerprint = viaje.id + '_' + feedTelemetry.length + '_' + (feedTelemetry.length > 0 ? feedTelemetry[0].timestamp_sensor + '_' + feedTelemetry[0].temp : '');
			if (feedList.getAttribute('data-fingerprint') !== feedFingerprint) {
				feedList.innerHTML = renderFeed(detail);
				feedList.setAttribute('data-fingerprint', feedFingerprint);
			}

			requestAnimationFrame(() => updateInteractiveMap(detail, simulation));

			backendSummary.innerHTML = '<strong>' + interp.telemetryCount + '</strong> lecturas interpretadas por el backend. <br />'
				+ 'Incidentes térmicos: <strong>' + interp.breachedCount + '</strong>. <br />'
				+ 'Último dato: <strong>' + formatDate(interp.latestTelemetry?.timestamp_sensor) + '</strong>';
		}

		async function refreshState() {
			try {
				const response = await fetch(apiStateUrl, { cache: 'no-store' });
				if (!response.ok) {
					throw new Error('No se pudo leer el estado del simulador.');
				}

				const state = await response.json();
				updatePage(state);
			} catch (error) {
				connectionState.textContent = error instanceof Error ? error.message : 'Error inesperado';
			}
		}

		tripList.addEventListener('click', async (event) => {
			const item = event.target.closest('[data-trip-id]');
			if (!item) return;
			const tripId = item.getAttribute('data-trip-id');
			if (!tripId) return;
			await postJson('/api/simulation/select', { viajeId: tripId });
			await refreshState();
		});

		mapWrap.addEventListener('click', (event) => {
			if (event.target.id === 'resetMapCam') {
				isUserInteractingMap = false;
				const btn = document.getElementById('resetMapCam');
				if (btn) btn.style.display = 'none';
				if (leafletMap && lastRoutePoints.length > 0) {
					leafletMap.fitBounds(window.L.latLngBounds(lastRoutePoints), { animate: true });
				}
			}
		});

		toggleBtn.addEventListener('click', async () => {
			toggleBtn.disabled = true;
			try {
				await postJson('/api/simulation/toggle');
				await refreshState();
			} finally {
				toggleBtn.disabled = false;
			}
		});

		stepBtn.addEventListener('click', async () => {
			stepBtn.disabled = true;
			try {
				await postJson('/api/simulation/step');
				await refreshState();
			} finally {
				stepBtn.disabled = false;
			}
		});

		syncBtn.addEventListener('click', async () => {
			syncBtn.disabled = true;
			try {
				await postJson('/api/simulation/refresh');
				await refreshState();
			} finally {
				syncBtn.disabled = false;
			}
		});

		openDashboardBtn.addEventListener('click', () => {
			window.open('http://localhost:3001/dashboard-v2', '_blank', 'noreferrer');
		});

		if (gateToggle) {
			gateToggle.addEventListener('change', async () => {
				gateToggle.disabled = true;
				try {
					await postJson('/api/simulation/toggle-gate-opening', { enabled: gateToggle.checked });
				} catch (error) {
					console.error(error);
				} finally {
					gateToggle.disabled = false;
				}
			});
		}

		if (turboToggle) {
			turboToggle.addEventListener('change', async () => {
				turboToggle.disabled = true;
				try {
					await postJson('/api/simulation/toggle-turbo', { enabled: turboToggle.checked });
				} catch (error) {
					console.error(error);
				} finally {
					turboToggle.disabled = false;
				}
			});
		}

		if (compressorToggle) {
			compressorToggle.addEventListener('change', async () => {
				const activeTrip = document.querySelector('.stack-item.active');
				const viajeId = activeTrip ? activeTrip.getAttribute('data-trip-id') : null;
				if (!viajeId) return;

				compressorToggle.disabled = true;
				try {
					await postJson('/api/simulation/toggle-compressor', { viajeId, enabled: compressorToggle.checked });
				} catch (error) {
					console.error(error);
				} finally {
					compressorToggle.disabled = false;
				}
			});
		}

		if (deviationToggle) {
			deviationToggle.addEventListener('change', async () => {
				const activeTrip = document.querySelector('.stack-item.active');
				const viajeId = activeTrip ? activeTrip.getAttribute('data-trip-id') : null;
				if (!viajeId) return;

				deviationToggle.disabled = true;
				try {
					await postJson('/api/simulation/toggle-deviation', { viajeId, enabled: deviationToggle.checked });
				} catch (error) {
					console.error(error);
				} finally {
					deviationToggle.disabled = false;
				}
			});
		}

		if (forceGateBtn) {
			forceGateBtn.addEventListener('click', async () => {
				const activeTrip = document.querySelector('.stack-item.active');
				const viajeId = activeTrip ? activeTrip.getAttribute('data-trip-id') : null;
				if (!viajeId) return;

				forceGateBtn.disabled = true;
				try {
					await postJson('/api/simulation/force-gate', { viajeId });
				} catch (error) {
					console.error(error);
				} finally {
					forceGateBtn.disabled = false;
				}
			});
		}

		refreshState();
		setInterval(refreshState, 3000);
	</script>
</body>
</html>`;
}

async function handleApiRequest(req, res, pathname) {
	if (req.method === 'GET' && pathname === '/api/state') {
		res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
		res.end(JSON.stringify(await buildDashboardSnapshot()));
		return true;
	}

	if (req.method === 'POST' && pathname === '/api/simulation/select') {
		let body = '';
		for await (const chunk of req) {
			body += chunk;
		}

		let payload = {};
		try {
			payload = body ? JSON.parse(body) : {};
		} catch {
			payload = {};
		}

		if (payload.viajeId && simulationMap.has(payload.viajeId)) {
			runtimeState.selectedTripId = payload.viajeId;
			logEvent('info', `Viaje seleccionado: ${payload.viajeId}`, payload.viajeId);
		}

		res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
		res.end(JSON.stringify({ selectedTripId: runtimeState.selectedTripId }));
		return true;
	}

	if (req.method === 'POST' && pathname === '/api/simulation/toggle') {
		runtimeState.paused = !runtimeState.paused;
		logEvent('info', runtimeState.paused ? 'Simulación pausada manualmente.' : 'Simulación reanudada manualmente.');
		res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
		res.end(JSON.stringify({ paused: runtimeState.paused }));
		return true;
	}

	if (req.method === 'POST' && pathname === '/api/simulation/toggle-gate-opening') {
		let body = '';
		for await (const chunk of req) {
			body += chunk;
		}
		let payload = {};
		try {
			payload = body ? JSON.parse(body) : {};
		} catch {
			payload = {};
		}

		runtimeState.gateOpeningEnabled = payload.enabled !== undefined ? !!payload.enabled : !runtimeState.gateOpeningEnabled;
		logEvent('info', runtimeState.gateOpeningEnabled ? 'Eventos probabilísticos de apertura de compuerta ACTIVADOS.' : 'Eventos probabilísticos de apertura de compuerta DESACTIVADOS.');
		res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
		res.end(JSON.stringify({ gateOpeningEnabled: runtimeState.gateOpeningEnabled }));
		return true;
	}

	if (req.method === 'POST' && pathname === '/api/simulation/toggle-compressor') {
		let body = '';
		for await (const chunk of req) {
			body += chunk;
		}
		let payload = {};
		try {
			payload = body ? JSON.parse(body) : {};
		} catch {
			payload = {};
		}

		if (payload.viajeId && simulationMap.has(payload.viajeId)) {
			const state = simulationMap.get(payload.viajeId);
			state.compressorFailed = payload.enabled !== undefined ? !!payload.enabled : !state.compressorFailed;
			logEvent('warn', state.compressorFailed ? `Simulador: Compresor APAGADO (Falla) para viaje ${payload.viajeId}.` : `Simulador: Compresor ENCENDIDO (Normal) para viaje ${payload.viajeId}.`, payload.viajeId);
			res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
			res.end(JSON.stringify({ viajeId: payload.viajeId, compressorFailed: state.compressorFailed }));
		} else {
			res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
			res.end(JSON.stringify({ error: 'Viaje no encontrado o inactivo.' }));
		}
		return true;
	}

	if (req.method === 'POST' && pathname === '/api/simulation/toggle-deviation') {
		let body = '';
		for await (const chunk of req) {
			body += chunk;
		}
		let payload = {};
		try {
			payload = body ? JSON.parse(body) : {};
		} catch {
			payload = {};
		}

		if (payload.viajeId && simulationMap.has(payload.viajeId)) {
			const state = simulationMap.get(payload.viajeId);
			state.routeDeviated = payload.enabled !== undefined ? !!payload.enabled : !state.routeDeviated;
			logEvent('warn', state.routeDeviated ? `Simulador: Camión DESVIADO de su ruta OSRM para viaje ${payload.viajeId}.` : `Simulador: Camión REGRESADO a su ruta OSRM para viaje ${payload.viajeId}.`, payload.viajeId);
			res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
			res.end(JSON.stringify({ viajeId: payload.viajeId, routeDeviated: state.routeDeviated }));
		} else {
			res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
			res.end(JSON.stringify({ error: 'Viaje no encontrado o inactivo.' }));
		}
		return true;
	}

	if (req.method === 'POST' && pathname === '/api/simulation/toggle-turbo') {
		let body = '';
		for await (const chunk of req) {
			body += chunk;
		}
		let payload = {};
		try {
			payload = body ? JSON.parse(body) : {};
		} catch {
			payload = {};
		}

		runtimeState.turboMode = payload.enabled !== undefined ? !!payload.enabled : !runtimeState.turboMode;
		logEvent('info', runtimeState.turboMode ? 'Simulador: Modo Turbo ACTIVADO (Ticks rápidos cada 2s + avance acelerado).' : 'Simulador: Modo Turbo DESACTIVADO (Ticks normales).');
		
		scheduleNextTick();

		res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
		res.end(JSON.stringify({ turboMode: runtimeState.turboMode }));
		return true;
	}

	if (req.method === 'POST' && pathname === '/api/simulation/force-gate') {
		let body = '';
		for await (const chunk of req) {
			body += chunk;
		}
		let payload = {};
		try {
			payload = body ? JSON.parse(body) : {};
		} catch {
			payload = {};
		}

		if (payload.viajeId && simulationMap.has(payload.viajeId)) {
			const state = simulationMap.get(payload.viajeId);
			state.gateOpenTicks = 4;
			logEvent('warn', `Simulador: Apertura MANUAL de compuerta forzada para viaje ${payload.viajeId}.`, payload.viajeId);
			res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
			res.end(JSON.stringify({ viajeId: payload.viajeId, gateOpenTicks: state.gateOpenTicks }));
		} else {
			res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
			res.end(JSON.stringify({ error: 'Viaje no encontrado o inactivo.' }));
		}
		return true;
	}

	if (req.method === 'POST' && pathname === '/api/simulation/refresh') {
		const trips = await syncActiveTrips();
		res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
		res.end(JSON.stringify({ activeTrips: trips.length }));
		return true;
	}

	if (req.method === 'POST' && pathname === '/api/simulation/step') {
		await tickSimulation();
		res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
		res.end(JSON.stringify({ ok: true }));
		return true;
	}

	return false;
}

const server = http.createServer(async (req, res) => {
	const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
	const { pathname } = requestUrl;

	try {
		if (await handleApiRequest(req, res, pathname)) {
			return;
		}

		if (req.method === 'GET' && pathname === '/health') {
			res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
			res.end(JSON.stringify({ ok: true }));
			return;
		}

		if (req.method === 'GET' && pathname === '/') {
			res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
			res.end(renderDashboardPage());
			return;
		}

		res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
		res.end(JSON.stringify({ message: 'Not found' }));
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Error inesperado';
		runtimeState.lastError = message;
		logEvent('error', message);
		res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
		res.end(JSON.stringify({ message }));
	}
});

server.listen(PORT, () => {
	console.log(`Simulador maestro escuchando en http://localhost:${PORT}`);
});

let tickTimeoutHandle = null;

function scheduleNextTick() {
	if (tickTimeoutHandle) {
		clearTimeout(tickTimeoutHandle);
	}
	const currentInterval = runtimeState.turboMode ? 2000 : TICK_INTERVAL_MS;
	tickTimeoutHandle = setTimeout(async () => {
		try {
			await tickSimulation();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Error al ejecutar el ciclo de simulación.';
			runtimeState.lastError = message;
			logEvent('error', message);
		}
		scheduleNextTick();
	}, currentInterval);
}

syncActiveTrips()
	.then(() => {
		scheduleNextTick();
	})
	.catch((error) => {
		runtimeState.lastError = error instanceof Error ? error.message : 'Error arrancando simulador';
		logEvent('error', runtimeState.lastError);
	});

setInterval(syncActiveTrips, SYNC_INTERVAL_MS);
