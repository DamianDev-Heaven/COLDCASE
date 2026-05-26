const http = require('http');
const { URL } = require('url');

const {
	ensureTripState,
	buildSample,
	advanceRouteState,
} = require('./src/physics');

const {
	renderDashboardPage,
} = require('./src/dashboard-template');

const {
	postTelemetry,
	buildDashboardSnapshot,
} = require('./src/api');

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
	iotFailure: false,
};

const simulationMap = new Map();

const fs = require('fs');
const path = require('path');

const STATE_FILE_PATH = process.env.STATE_FILE_PATH || path.join(__dirname, 'data', 'simulator_state.json');

function saveState() {
	try {
		const serialized = {
			paused: runtimeState.paused,
			selectedTripId: runtimeState.selectedTripId,
			gateOpeningEnabled: runtimeState.gateOpeningEnabled,
			turboMode: runtimeState.turboMode,
			iotFailure: runtimeState.iotFailure,
			simulations: [...simulationMap.entries()].map(([viajeId, state]) => ({
				viajeId,
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
				backendEstado: state.backendEstado,
				compressorFailed: state.compressorFailed,
				routeDeviated: state.routeDeviated,
				gateOpenTicks: state.gateOpenTicks,
				history: state.history,
			}))
		};
		const dir = path.dirname(STATE_FILE_PATH);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
		fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(serialized, null, 2), 'utf8');
	} catch (err) {
		console.error('Error al guardar el estado del simulador:', err);
	}
}

function loadState() {
	try {
		if (fs.existsSync(STATE_FILE_PATH)) {
			const data = fs.readFileSync(STATE_FILE_PATH, 'utf8');
			const parsed = JSON.parse(data);

			runtimeState.paused = !!parsed.paused;
			runtimeState.selectedTripId = parsed.selectedTripId || null;
			runtimeState.gateOpeningEnabled = parsed.gateOpeningEnabled !== false;
			runtimeState.turboMode = !!parsed.turboMode;
			runtimeState.iotFailure = !!parsed.iotFailure;

			if (Array.isArray(parsed.simulations)) {
				for (const sim of parsed.simulations) {
					simulationMap.set(sim.viajeId, {
						viajeId: sim.viajeId,
						progressIndex: sim.progressIndex || 0,
						progressStep: sim.progressStep || 0,
						direction: sim.direction || 1,
						telemetryCount: sim.telemetryCount || 0,
						incidentCount: sim.incidentCount || 0,
						lastTelemetryAt: sim.lastTelemetryAt || null,
						lastIncident: sim.lastIncident || null,
						lastPayload: sim.lastPayload || null,
						battery: sim.battery || 100,
						status: sim.status || 'activo',
						backendEstado: sim.backendEstado || 'pendiente',
						compressorFailed: !!sim.compressorFailed,
						routeDeviated: !!sim.routeDeviated,
						gateOpenTicks: sim.gateOpenTicks || 0,
						history: sim.history || [],
						routePoints: [],
					});
				}
			}
			console.log(`Estado del simulador cargado exitosamente desde ${STATE_FILE_PATH}`);
		}
	} catch (err) {
		console.error('Error al cargar el estado del simulador:', err);
	}
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
		backendEstado: state.backendEstado || 'pendiente',
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
			ensureTripState(viaje, simulationMap);
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
		const state = ensureTripState(viaje, simulationMap);
		const sample = buildSample(viaje, state, runtimeState, logEvent);

		try {
			const response = await postTelemetry(sample.payload, API_URL, runtimeState);
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
			
			const reachedEnd = advanceRouteState(state, runtimeState);
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
	saveState();
}

async function readBody(req) {
	let body = '';
	for await (const chunk of req) {
		body += chunk;
	}
	try {
		return body ? JSON.parse(body) : {};
	} catch {
		return {};
	}
}

async function handleApiRequest(req, res, pathname) {
	if (req.method === 'GET' && pathname === '/api/state') {
		res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
		res.end(JSON.stringify(await buildDashboardSnapshot(API_URL, runtimeState, simulationMap, serializeState)));
		return true;
	}

	if (req.method === 'POST' && pathname === '/api/simulation/select') {
		const payload = await readBody(req);
		if (payload.viajeId && simulationMap.has(payload.viajeId)) {
			runtimeState.selectedTripId = payload.viajeId;
			logEvent('info', `Viaje seleccionado: ${payload.viajeId}`, payload.viajeId);
			saveState();
		}

		res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
		res.end(JSON.stringify({ selectedTripId: runtimeState.selectedTripId }));
		return true;
	}

	if (req.method === 'POST' && pathname === '/api/simulation/toggle') {
		runtimeState.paused = !runtimeState.paused;
		logEvent('info', runtimeState.paused ? 'Simulación pausada manualmente.' : 'Simulación reanudada manualmente.');
		saveState();
		res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
		res.end(JSON.stringify({ paused: runtimeState.paused }));
		return true;
	}

	if (req.method === 'POST' && pathname === '/api/simulation/toggle-gate-opening') {
		const payload = await readBody(req);
		runtimeState.gateOpeningEnabled = payload.enabled !== undefined ? !!payload.enabled : !runtimeState.gateOpeningEnabled;
		logEvent('info', runtimeState.gateOpeningEnabled ? 'Eventos probabilísticos de apertura de compuerta ACTIVADOS.' : 'Eventos probabilísticos de apertura de compuerta DESACTIVADOS.');
		saveState();
		res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
		res.end(JSON.stringify({ gateOpeningEnabled: runtimeState.gateOpeningEnabled }));
		return true;
	}

	if (req.method === 'POST' && pathname === '/api/simulation/toggle-compressor') {
		const payload = await readBody(req);
		if (payload.viajeId && simulationMap.has(payload.viajeId)) {
			const state = simulationMap.get(payload.viajeId);
			state.compressorFailed = payload.enabled !== undefined ? !!payload.enabled : !state.compressorFailed;
			logEvent('warn', state.compressorFailed ? `Simulador: Compresor APAGADO (Falla) para viaje ${payload.viajeId}.` : `Simulador: Compresor ENCENDIDO (Normal) para viaje ${payload.viajeId}.`, payload.viajeId);
			saveState();
			res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
			res.end(JSON.stringify({ viajeId: payload.viajeId, compressorFailed: state.compressorFailed }));
		} else {
			res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
			res.end(JSON.stringify({ error: 'Viaje no encontrado o inactivo.' }));
		}
		return true;
	}

	if (req.method === 'POST' && pathname === '/api/simulation/toggle-deviation') {
		const payload = await readBody(req);
		if (payload.viajeId && simulationMap.has(payload.viajeId)) {
			const state = simulationMap.get(payload.viajeId);
			state.routeDeviated = payload.enabled !== undefined ? !!payload.enabled : !state.routeDeviated;
			logEvent('warn', state.routeDeviated ? `Simulador: Camión DESVIADO de su ruta OSRM para viaje ${payload.viajeId}.` : `Simulador: Camión REGRESADO a su ruta OSRM para viaje ${payload.viajeId}.`, payload.viajeId);
			saveState();
			res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
			res.end(JSON.stringify({ viajeId: payload.viajeId, routeDeviated: state.routeDeviated }));
		} else {
			res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
			res.end(JSON.stringify({ error: 'Viaje no encontrado o inactivo.' }));
		}
		return true;
	}

	if (req.method === 'POST' && pathname === '/api/simulation/toggle-turbo') {
		const payload = await readBody(req);
		runtimeState.turboMode = payload.enabled !== undefined ? !!payload.enabled : !runtimeState.turboMode;
		logEvent('info', runtimeState.turboMode ? 'Simulador: Modo Turbo ACTIVADO (Ticks rápidos cada 2s + avance acelerado).' : 'Simulador: Modo Turbo DESACTIVADO (Ticks normales).');
		saveState();
		
		scheduleNextTick();

		res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
		res.end(JSON.stringify({ turboMode: runtimeState.turboMode }));
		return true;
	}

	if (req.method === 'POST' && pathname === '/api/simulation/toggle-iot-link') {
		const payload = await readBody(req);
		runtimeState.iotFailure = payload.enabled !== undefined ? !!payload.enabled : !runtimeState.iotFailure;
		logEvent('info', runtimeState.iotFailure 
			? 'Simulador: Enlace de sensores IoT APAGADO (Pérdida de señal celular activa).' 
			: 'Simulador: Enlace de sensores IoT ENCENDIDO (Señal celular normal).'
		);
		saveState();
		res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
		res.end(JSON.stringify({ iotFailure: runtimeState.iotFailure }));
		return true;
	}

	if (req.method === 'POST' && pathname === '/api/simulation/toggle-queue') {
		let isPaused = false;
		try {
			const statusRes = await fetch(`${API_URL}/ia/queue/status`);
			const status = await statusRes.json();
			const action = status.isPaused ? 'resume' : 'pause';
			
			const toggleRes = await fetch(`${API_URL}/ia/queue/${action}`, { method: 'POST' });
			const toggle = await toggleRes.json();
			isPaused = toggle.isPaused;
			
			logEvent('info', isPaused 
				? 'Simulador: Worker IA fuera de línea (Cola de Redis BullMQ PAUSADA).' 
				: 'Simulador: Worker IA en línea (Cola de Redis BullMQ REANUDADA).'
			);
		} catch (err) {
			logEvent('error', `Error al comunicar con la cola de Redis: ${err.message}`);
		}
		
		res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
		res.end(JSON.stringify({ queuePaused: isPaused }));
		return true;
	}

	if (req.method === 'GET' && pathname === '/api/simulation/queue-status') {
		let isPaused = false;
		try {
			const statusRes = await fetch(`${API_URL}/ia/queue/status`);
			const status = await statusRes.json();
			isPaused = status.isPaused;
		} catch (err) {
			// Ignorar
		}
		res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
		res.end(JSON.stringify({ queuePaused: isPaused }));
		return true;
	}

	if (req.method === 'POST' && pathname === '/api/simulation/force-gate') {
		const payload = await readBody(req);
		if (payload.viajeId && simulationMap.has(payload.viajeId)) {
			const state = simulationMap.get(payload.viajeId);
			state.gateOpenTicks = 4;
			logEvent('warn', `Simulador: Apertura MANUAL de compuerta forzada para viaje ${payload.viajeId}.`, payload.viajeId);
			saveState();
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

	if (req.method === 'POST' && pathname === '/api/simulation/iniciar-viaje') {
		const body = await readBody(req);
		const { viajeId } = body;
		if (!viajeId) {
			res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
			res.end(JSON.stringify({ message: 'viajeId requerido' }));
			return true;
		}
		const backendRes = await fetch(`${API_URL}/viaje/${viajeId}/iniciar`, { method: 'PATCH' });
		const data = await backendRes.json().catch(() => ({}));
		if (!backendRes.ok) {
			res.writeHead(backendRes.status, { 'Content-Type': 'application/json; charset=utf-8' });
			res.end(JSON.stringify(data));
			return true;
		}
		await syncActiveTrips({ log: false });
		logEvent('info', `Viaje ${viajeId} iniciado manualmente desde el simulador.`);
		res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
		res.end(JSON.stringify({ ok: true, viaje: data }));
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

loadState();

syncActiveTrips()
	.then(() => {
		scheduleNextTick();
	})
	.catch((error) => {
		runtimeState.lastError = error instanceof Error ? error.message : 'Error arrancando simulador';
		logEvent('error', runtimeState.lastError);
	});

setInterval(syncActiveTrips, SYNC_INTERVAL_MS);
