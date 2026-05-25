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
		return;
	}

	state.progressStep += 0.22;

	if (state.progressStep < 1) {
		return;
	}

	state.progressStep = 0;
	state.progressIndex += state.direction;

	const maxIndex = state.routePoints.length - 2;
	if (state.progressIndex >= maxIndex) {
		state.progressIndex = maxIndex;
		state.direction = -1;
	}

	if (state.progressIndex <= 0) {
		state.progressIndex = 0;
		state.direction = 1;
	}
}

function buildSample(viaje, state) {
	const routePosition = getRoutePosition(state);
	const limitMaxTemp = asNumber(viaje.limite_max_temp, 5);
	const limitMinTemp = viaje.limite_min_temp == null ? limitMaxTemp - 3 : asNumber(viaje.limite_min_temp, limitMaxTemp - 3);

	// Temperatura base del viaje
	const baseTemp = limitMaxTemp - 1.2 + state.temperatureBias;

	// 1. Modelo de Random Walk térmico
	// Extraer temperatura anterior del estado en memoria, o usar baseTemp al inicio
	let temp = state.lastPayload ? state.lastPayload.temp : baseTemp;

	// Fluctación de ruido ambiental aleatoria entre -0.5°C y +0.5°C
	const noise = Math.random() * 1.0 - 0.5;
	temp += noise;

	// 2. Simulación de Eventos Críticos Probabilísticos (Apertura de Compuerta)
	if (runtimeState.gateOpeningEnabled !== false) {
		const rand = Math.random();
		if (rand > 0.98) {
			temp += 4.5;
			logEvent('warn', `Simulador: Apertura de Compuerta detectada en viaje ${viaje.id}. Incremento súbito de 4.5°C.`, viaje.id);
		}
	}

	// Redondear temperatura a 1 decimal
	temp = Number(temp.toFixed(1));

	const humidity = Number(clamp(66 + Math.cos((state.telemetryCount + state.routeSeed) / 3.2) * 7, 35, 94).toFixed(1));
	const batteryDrain = state.routeSeed % 3 === 0 ? 1.8 : 0.9;
	const battery = Math.max(0, Math.min(100, Math.round(state.battery - batteryDrain)));

	state.battery = battery;
	state.telemetryCount += 1;
	state.lastTelemetryAt = new Date().toISOString();
	state.lastPayload = {
		viaje_id: viaje.id,
		lat: Number(routePosition.lat.toFixed(6)),
		lon: Number(routePosition.lon.toFixed(6)),
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
		routePosition,
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
			state.status = response.incidente_id ? 'alerta' : 'activo';
			advanceRouteState(state);

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
		:root {
			color-scheme: dark;
			--bg: #0b0f14;
			--panel: #131824;
			--panel-2: #0f131b;
			--line: #243042;
			--text: #f8fafc;
			--muted: #94a3b8;
			--cyan: #4cc9f0;
			--emerald: #22c55e;
			--amber: #f59e0b;
			--rose: #ef4444;
			--violet: #8b5cf6;
		}

		* { box-sizing: border-box; }
		body {
			margin: 0;
			min-height: 100vh;
			background:
				radial-gradient(circle at top left, rgba(76, 201, 240, 0.10), transparent 30%),
				radial-gradient(circle at bottom right, rgba(139, 92, 246, 0.08), transparent 24%),
				linear-gradient(180deg, #090c10, var(--bg));
			color: var(--text);
			font-family: Inter, ui-sans-serif, system-ui, sans-serif;
			overflow-x: hidden;
			overflow-y: auto;
		}

		.topbar {
			position: sticky;
			top: 0;
			height: 64px;
			background: rgba(19, 24, 36, 0.92);
			border-bottom: 1px solid rgba(148, 163, 184, 0.14);
			backdrop-filter: blur(16px);
			z-index: 30;
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding: 0 20px;
		}

		.shell {
			width: 100%;
			max-width: 1600px;
			margin: 0 auto;
			padding: 16px;
			display: grid;
			grid-template-columns: 320px minmax(0, 1fr);
			gap: 12px;
			height: auto;
			min-height: calc(100vh - 64px);
			min-height: 0;
			overflow: visible;
		}

		.sidebar,
		.workspace {
			min-height: 0;
			overflow: visible;
		}

		.sidebar {
			background: rgba(19, 24, 36, 0.92);
			display: grid;
			grid-template-rows: auto 1fr auto;
			gap: 12px;
			max-height: calc(100vh - 96px);
			position: sticky;
			top: 80px;
			overflow: hidden;
		}

		.workspace {
			display: grid;
			grid-template-rows: auto auto auto;
			gap: 12px;
			align-items: stretch;
		}

		.panel,
		.card,
		.stack-item {
			background: linear-gradient(180deg, rgba(19, 24, 36, 0.96), rgba(15, 19, 27, 0.96));
			border: 1px solid rgba(148, 163, 184, 0.12);
			border-radius: 22px;
			box-shadow: 0 18px 40px rgba(2, 6, 23, 0.28);
		}

		.panel { padding: 16px; min-height: 0; }
		.stack { overflow: auto; padding: 0 10px 12px; display: grid; gap: 10px; min-height: 0; max-height: 100%; overscroll-behavior: contain; }
		.stack-item { padding: 14px; cursor: pointer; transition: transform .16s ease, border-color .16s ease, background .16s ease; }
		.stack-item:hover { transform: translateY(-1px); border-color: rgba(76, 201, 240, 0.28); }
		.stack-item.active { border-color: rgba(76, 201, 240, 0.55); background: linear-gradient(180deg, rgba(76, 201, 240, 0.10), rgba(15, 19, 27, 0.96)); }

		.eyebrow {
			text-transform: uppercase;
			letter-spacing: 0.32em;
			font-size: 10px;
			color: var(--cyan);
			font-weight: 800;
		}

		.title {
			margin: 8px 0 0;
			font-size: 2rem;
			line-height: 1;
		}

		.muted { color: var(--muted); }

		.controls, .stat-grid {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 10px;
			margin-top: 14px;
		}

		.btn {
			border: 1px solid rgba(148, 163, 184, 0.18);
			background: rgba(15, 19, 27, 0.9);
			color: var(--text);
			border-radius: 14px;
			padding: 12px 14px;
			font-weight: 700;
			cursor: pointer;
			transition: transform .16s ease, border-color .16s ease, background .16s ease;
		}

		.btn:hover { transform: translateY(-1px); border-color: rgba(76, 201, 240, 0.38); }
		.btn.primary { background: linear-gradient(135deg, #4cc9f0, #22c55e); color: #05131a; border-color: transparent; }
		.btn.warn { background: rgba(239, 68, 68, 0.14); border-color: rgba(239, 68, 68, 0.28); }

		.tag {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			border-radius: 999px;
			padding: 6px 12px;
			font-size: 11px;
			font-weight: 800;
			border: 1px solid rgba(148, 163, 184, 0.18);
			background: rgba(15, 19, 27, 0.9);
		}

		.tag.activo { color: #bbf7d0; border-color: rgba(34, 197, 94, 0.24); }
		.tag.alerta { color: #fef3c7; border-color: rgba(245, 158, 11, 0.28); }
		.tag.error { color: #fecaca; border-color: rgba(239, 68, 68, 0.28); }
		.tag.pausado { color: #e2e8f0; border-color: rgba(148, 163, 184, 0.22); }
		.tag.osrm { color: #cffafe; border-color: rgba(76, 201, 240, 0.28); }

		.card {
			padding: 16px;
			display: grid;
			gap: 12px;
			min-height: 0;
		}

		.metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
		.metric { padding: 14px; border-radius: 18px; background: rgba(7, 10, 16, 0.45); border: 1px solid rgba(148, 163, 184, 0.12); }
		.metric span { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.22em; color: var(--muted); }
		.metric strong { display: block; margin-top: 10px; font-size: 1.4rem; }

		.map-card, .chart-card, .feed-card {
			overflow: hidden;
			background: rgba(19, 24, 36, 0.92);
			border: 1px solid rgba(148, 163, 184, 0.12);
			border-radius: 22px;
			box-shadow: 0 18px 40px rgba(2, 6, 23, 0.24);
			display: flex;
			flex-direction: column;
			min-height: 0;
		}

		.map-card { padding: 14px; }
		.chart-card { padding: 14px; }
		.feed-card { padding: 14px; display: flex; gap: 10px; }
		.chart-card { overflow: hidden; }
		.chart-wrap {
			overflow: auto;
			min-height: 0;
			flex: 1;
			padding-bottom: 4px;
			overflow-x: auto;
			overflow-y: hidden;
			overscroll-behavior: contain;
			display: block;
		}
		.chart-scroll {
			min-width: 1120px;
			height: 360px;
			min-height: 360px;
		}

		.two-cols > * { min-height: 0; }
		.map-svg, .chart-svg { width: 100%; height: 100%; display: block; }
		.map-wrap,
		.map-wrap {
			flex: 1;
			min-height: 0;
			position: relative;
		}
		.map-shell {
			position: relative;
			height: 100%;
			min-height: 420px;
			border-radius: 18px;
			overflow: hidden;
			background: linear-gradient(180deg, #0b1016, #09111a);
		}
		.leaflet-map {
			position: absolute;
			inset: 0;
			width: 100%;
			height: 100%;
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
		.map-hud .tag { pointer-events: none; backdrop-filter: blur(10px); }
		.map-banner {
			position: absolute;
			left: 10px;
			bottom: 10px;
			z-index: 500;
			max-width: min(520px, calc(100% - 20px));
			padding: 10px 12px;
			border-radius: 14px;
			border: 1px solid rgba(148, 163, 184, 0.16);
			background: rgba(15, 19, 27, 0.82);
			backdrop-filter: blur(10px);
			font-size: 12px;
			color: var(--text);
		}
		.map-legend {
			position: absolute;
			right: 10px;
			bottom: 10px;
			z-index: 500;
			display: grid;
			gap: 6px;
			padding: 10px 12px;
			border-radius: 14px;
			border: 1px solid rgba(148, 163, 184, 0.16);
			background: rgba(15, 19, 27, 0.82);
			backdrop-filter: blur(10px);
			font-size: 12px;
			color: var(--text);
			max-width: min(260px, calc(100% - 20px));
		}
		.legend-row {
			display: flex;
			align-items: center;
			gap: 8px;
			white-space: nowrap;
		}
		.legend-dot {
			width: 10px;
			height: 10px;
			border-radius: 999px;
			flex: 0 0 auto;
		}
		.legend-dot.route { background: #7dd3fc; }
		.legend-dot.temp { background: #ef4444; }
		.legend-dot.battery { background: #f59e0b; }
		.legend-dot.current { background: #4cc9f0; }
		.map-banner strong { color: #fff; }
		.map-fallback {
			position: absolute;
			inset: 0;
			display: flex;
			align-items: center;
			justify-content: center;
			text-align: center;
			padding: 18px;
			color: var(--muted);
			background: rgba(7, 10, 16, 0.48);
		}

		.two-cols {
			display: none;
		}

		.main-grid {
			display: grid;
			grid-template-columns: minmax(0, 1.45fr) minmax(340px, 420px);
			gap: 12px;
			min-height: 0;
			align-items: stretch;
		}

		.main-stack {
			display: grid;
			grid-template-rows: minmax(420px, 1.08fr) minmax(300px, 0.92fr);
			gap: 12px;
			min-height: 0;
		}

		.main-grid > * {
			min-height: 0;
		}

		.feed-card {
			overflow: hidden;
			max-height: calc(100vh - 260px);
		}

		.feed-list {
			overflow: auto;
			display: grid;
			gap: 10px;
			max-height: 100%;
			min-height: 0;
			flex: 1;
			overscroll-behavior: contain;
		}
		.feed-item { padding: 12px; border-radius: 16px; background: rgba(7, 10, 16, 0.42); border: 1px solid rgba(148, 163, 184, 0.10); }
		.feed-item strong { display: block; font-size: 13px; }
		.feed-item small { display: block; margin-top: 6px; color: var(--muted); }

		.empty {
			padding: 18px;
			border-radius: 18px;
			border: 1px dashed rgba(148, 163, 184, 0.16);
			color: var(--muted);
			background: rgba(7, 10, 16, 0.35);
		}

		/* Estilos para el switch de toggle premium */
		.switch input:checked + .slider {
			background-color: var(--cyan);
		}
		.slider:before {
			position: absolute;
			content: "";
			height: 16px;
			width: 16px;
			left: 4px;
			bottom: 4px;
			background-color: #ffffff;
			transition: .3s ease;
			border-radius: 50%;
			box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
		}
		.switch input:checked + .slider:before {
			transform: translateX(20px);
		}

		@media (max-width: 1400px) {
			.shell { grid-template-columns: 300px minmax(0, 1fr); }
		}

		@media (max-width: 1080px) {
			.shell { grid-template-columns: 1fr; height: auto; min-height: 0; overflow: auto; }
			.workspace { grid-template-rows: auto auto; }
			.main-grid { grid-template-columns: 1fr; }
			.main-stack { grid-template-rows: auto auto; }
			.metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
			.controls { grid-template-columns: repeat(2, minmax(0, 1fr)); }
			.map-shell { min-height: 360px; }
		}

		@media (max-width: 680px) {
			.topbar { height: auto; padding: 12px 14px; gap: 12px; flex-direction: column; align-items: flex-start; }
			.controls { width: 100%; grid-template-columns: 1fr; }
			.shell { padding: 12px; }
			.metrics { grid-template-columns: 1fr; }
			.stat-grid { grid-template-columns: 1fr 1fr; }
			.map-shell { min-height: 320px; }
		}
	</style>
</head>
<body>
	<header class="topbar">
		<div>
			<div class="eyebrow">Simulador maestro</div>
			<div class="muted" id="connectionState">Conectando con backend...</div>
		</div>
		<div class="controls" style="grid-template-columns: repeat(4, auto); margin-top:0;">
			<button id="toggleBtn" class="btn primary">Pausar</button>
			<button id="stepBtn" class="btn">Forzar ciclo</button>
			<button id="syncBtn" class="btn">Sincronizar</button>
			<button id="openDashboardBtn" class="btn warn">Dashboard V2</button>
		</div>
	</header>

	<div class="shell">
		<aside class="sidebar">
			<div class="panel">
				<div class="eyebrow">Panel de control</div>
				<h1 class="title">Viajes activos</h1>
				<p class="muted" style="margin:10px 0 0;">Selecciona un viaje para ver ruta, telemetría y estado de envío.</p>
				<div class="stat-grid">
					<div class="metric"><span>Activos</span><strong id="activeTrips">0</strong></div>
					<div class="metric"><span>Enviados</span><strong id="sentTrips">0</strong></div>
					<div class="metric"><span>Incidentes</span><strong id="incidentTrips">0</strong></div>
					<div class="metric"><span>Sync</span><strong id="lastSync">-</strong></div>
				</div>
				<div style="margin-top: 14px; padding: 12px 14px; border-radius: 18px; background: rgba(7, 10, 16, 0.45); border: 1px solid rgba(148, 163, 184, 0.12); display: flex; align-items: center; justify-content: space-between; gap: 10px;">
					<div>
						<div style="font-size: 13px; font-weight: 700; color: var(--text);">Apertura de Compuerta</div>
						<div style="font-size: 11px; color: var(--muted); margin-top: 2px;">Eventos críticos (2% prob. +4.5°C)</div>
					</div>
					<label class="switch" style="position: relative; display: inline-block; width: 44px; height: 24px; flex: 0 0 auto;">
						<input type="checkbox" id="gateToggle" checked style="opacity: 0; width: 0; height: 0;">
						<span class="slider" style="position: absolute; cursor: pointer; inset: 0; background-color: rgba(148, 163, 184, 0.28); transition: .3s; border-radius: 24px;"></span>
					</label>
				</div>
			</div>
			<div class="stack" id="tripList"></div>
			<div class="panel">
				<div class="muted" id="statusText">Esperando estado...</div>
			</div>
		</aside>

		<section class="workspace">
			<section class="card">
				<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;">
					<div>
						<div class="eyebrow">Vista operativa</div>
						<h2 style="margin:8px 0 0;font-size:2rem;" id="selectedTitle">Sin viaje seleccionado</h2>
						<p class="muted" id="selectedSubtitle" style="margin:8px 0 0;">La telemetría aparecerá aquí cuando el simulador seleccione un viaje en curso.</p>
					</div>
					<div style="display:flex;gap:8px;flex-wrap:wrap;">
						<span class="tag osrm" id="previewTag">OSRM</span>
						<span class="tag" id="stateTag">activo</span>
					</div>
				</div>
				<div class="metrics">
					<div class="metric"><span>Temp actual</span><strong id="tempNow">-</strong></div>
					<div class="metric"><span>Humedad</span><strong id="humidityNow">-</strong></div>
					<div class="metric"><span>Batería</span><strong id="batteryNow">-</strong></div>
					<div class="metric"><span>Lecturas backend</span><strong id="telemetryCount">-</strong></div>
				</div>
			</section>

			<div class="main-grid">
				<div class="main-stack">
					<section class="map-card">
						<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px;">
							<div>
								<div class="eyebrow">Mapa OSRM</div>
								<div class="muted">Ruta, posición y avance del vehículo</div>
							</div>
							<div class="tag" id="routeSourceTag">fallback</div>
						</div>
						<div class="map-wrap" id="mapWrap"><div class="empty">Selecciona un viaje para ver la ruta.</div></div>
					</section>

					<section class="chart-card">
						<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px;">
							<div>
								<div class="eyebrow">Gráfica térmica</div>
								<div class="muted">Lecturas recibidas e interpretación del backend</div>
							</div>
							<div class="tag" id="rangeTag">Zona segura</div>
						</div>
						<div class="chart-wrap" id="chartWrap"><div class="empty">Sin datos todavía.</div></div>
					</section>
				</div>

				<section class="feed-card">
					<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
						<div>
							<div class="eyebrow">Telemetría interpretada</div>
							<div class="muted" id="backendSummary">Sin información del backend.</div>
						</div>
						<div class="muted" id="lastTick">Sin tick aún.</div>
					</div>
					<div class="feed-list" id="feedList"></div>
				</section>
			</div>
		</section>
	</div>

	<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
	<script>
		const apiStateUrl = '/api/state';
		const toggleBtn = document.getElementById('toggleBtn');
		const gateToggle = document.getElementById('gateToggle');
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
			return '<div class="map-shell">'
				+ '<div class="map-hud">'
				+ '<span class="tag osrm">Mapa real · Arrastra y haz zoom</span>'
				+ '<span class="tag ' + (status === 'alerta' ? 'alerta' : 'activo') + '">' + escapeHtml(status) + '</span>'
				+ '</div>'
				+ '<div class="leaflet-map" id="leafletMap"></div>'
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
			}

			if (!leafletLayer) return;
			leafletLayer.clearLayers();

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
			} else if (selectedTripId && leafletMapReady && !leafletMap.getBounds().contains(bounds)) {
				leafletMap.fitBounds(bounds.pad(0.1), { animate: false });
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
			const height = 340;
			const pad = 34;

			const xStep = telemetry.length > 1 ? (width - pad * 2) / (telemetry.length - 1) : 0;
			const yScale = (temp) => height - pad - ((temp - low) / (high - low)) * (height - pad * 2);
			const xScale = (index) => pad + index * xStep;
			const linePoints = telemetry.map((point, index) => xScale(index).toFixed(1) + ',' + yScale(Number(point.temp)).toFixed(1)).join(' ');

			return '<div class="chart-scroll">'
				+ '<svg class="chart-svg" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none" role="img" aria-label="Gráfica térmica">'
				+ '<rect width="' + width + '" height="' + height + '" fill="#0b1016" />'
				+ '<rect x="' + pad + '" y="' + yScale(maxTemp) + '" width="' + (width - pad * 2) + '" height="' + (yScale(minTemp) - yScale(maxTemp)) + '" fill="rgba(34,197,94,0.08)" />'
				+ Array.from({ length: 5 }, (_, index) => '<line x1="' + pad + '" y1="' + (pad + index * ((height - pad * 2) / 4)) + '" x2="' + (width - pad) + '" y2="' + (pad + index * ((height - pad * 2) / 4)) + '" stroke="rgba(148,163,184,0.10)" />').join('')
				+ '<line x1="' + pad + '" y1="' + yScale(minTemp) + '" x2="' + (width - pad) + '" y2="' + yScale(minTemp) + '" stroke="rgba(34,197,94,0.35)" stroke-dasharray="6 6" />'
				+ '<line x1="' + pad + '" y1="' + yScale(maxTemp) + '" x2="' + (width - pad) + '" y2="' + yScale(maxTemp) + '" stroke="rgba(239,68,68,0.28)" stroke-dasharray="6 6" />'
				+ '<polyline points="' + linePoints + '" fill="none" stroke="#f8fafc" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />'
				+ telemetry.map((point, index) => {
					const temp = Number(point.temp);
					const x = xScale(index);
					const y = yScale(temp);
					const breach = temp > maxTemp || temp < minTemp || (point.bateria != null && Number(point.bateria) <= 10);
					return '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (breach ? 7 : 4) + '" fill="' + (breach ? '#ef4444' : '#4cc9f0') + '" />';
				}).join('')
				+ '</svg>'
				+ '</div>';
		}

		function renderFeed(detail) {
			const telemetry = Array.isArray(detail?.telemetry) ? detail.telemetry.slice().reverse() : [];
			if (!telemetry.length) {
				return '<div class="empty">El backend aún no ha devuelto telemetría para este viaje.</div>';
			}

			return telemetry.slice(0, 8).map((point) => {
				const breach = Number(point.temp) > Number(detail?.viaje?.limite_max_temp ?? 0) || Number(point.temp) < Number(detail?.viaje?.limite_min_temp ?? 0);
				
				const iaBlock = point.ia_diagnosis
					? '<div style="margin-top: 8px; padding: 10px; background: rgba(139, 92, 246, 0.15); border-left: 3px solid #8b5cf6; border-radius: 6px; color: #e2e8f0; font-size: 12px; font-style: italic;">'
						+ '<strong style="color: #c4b5fd; display: block; margin-bottom: 4px;">Zep & Groq Insight:</strong>'
						+ escapeHtml(point.ia_diagnosis)
						+ '</div>'
					: '';

				return '<div class="feed-item">'
					+ '<strong>' + (breach ? 'Incidente detectado' : 'Telemetría recibida') + '</strong>'
					+ '<small>' + formatDate(point.timestamp_sensor) + '</small>'
					+ '<small>Temp: ' + formatNumber(point.temp) + '°C · Hum: ' + formatNumber(point.humedad) + '% · Bat: ' + formatNumber(point.bateria, 0) + '%</small>'
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
			activeTrips.textContent = state.activeTrips ?? 0;
			sentTrips.textContent = state.totalSent ?? 0;
			incidentTrips.textContent = state.totalIncidents ?? 0;
			lastSync.textContent = formatDate(state.lastSyncAt);
			lastTick.textContent = state.lastTickAt ? 'Último tick: ' + formatDate(state.lastTickAt) : 'Sin tick aún.';
			statusText.textContent = state.paused ? 'Simulación pausada' : 'Simulación activa';
			connectionState.textContent = state.paused ? 'Worker detenido' : 'Worker ejecutándose';
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
				feedList.innerHTML = '<div class="empty">Sin datos.</div>';
				backendSummary.textContent = 'Sin detalle disponible.';
				telemetryCount.textContent = '-';
				stateTag.textContent = 'sin datos';
				routeSourceTag.textContent = 'fallback';
				previewTag.textContent = 'OSRM';
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

			if (renderedMapTripId !== viaje.id) {
				mapWrap.innerHTML = renderMap(detail, simulation);
				renderedMapTripId = viaje.id;
			}
			chartWrap.innerHTML = renderChart(detail, simulation);
			feedList.innerHTML = renderFeed(detail);

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

syncActiveTrips()
	.then(() => tickSimulation())
	.catch((error) => {
		runtimeState.lastError = error instanceof Error ? error.message : 'Error arrancando simulador';
		logEvent('error', runtimeState.lastError);
	});

setInterval(syncActiveTrips, SYNC_INTERVAL_MS);
setInterval(() => {
	tickSimulation().catch((error) => {
		const message = error instanceof Error ? error.message : 'Error al ejecutar el ciclo de simulación.';
		runtimeState.lastError = message;
		logEvent('error', message);
	});
}, TICK_INTERVAL_MS);
