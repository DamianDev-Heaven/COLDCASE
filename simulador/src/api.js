const { asNumber, parseRoutePoints } = require('./physics');

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

async function postTelemetry(payload, API_URL, runtimeState) {
	if (runtimeState.iotFailure) {
		throw new Error('ERR_SIGNAL_LOST: Sensores fuera de línea (Pérdida de señal celular/IoT simulada).');
	}
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

async function buildTripDetail(viajeId, API_URL) {
	if (!viajeId) {
		return null;
	}

	try {
		const viaje = await fetchJson(`${API_URL}/viaje/${viajeId}`);
		const routePoints = parseRoutePoints(viaje.ruta_waypoints);
		let routePreview = null;

		if (routePoints.length >= 2) {
			try {
				routePreview = await fetchJson(`${API_URL}/viaje/ruta-preview`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ waypoints: routePoints }),
				});
			} catch (error) {
				routePreview = { 
					geometry: routePoints.map((point) => [point.lon, point.lat]), 
					osrm_usado: false, 
					error: error instanceof Error ? error.message : 'fallback' 
				};
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
		const breachedCount = normalizedTelemetry.filter(
			(row) => row.temp > asNumber(viaje.limite_max_temp, 0) || row.temp < asNumber(viaje.limite_min_temp, -999)
		).length;

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

async function buildDashboardSnapshot(API_URL, runtimeState, simulationMap, serializeState) {
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

	const selectedDetail = await buildTripDetail(selectedTripId, API_URL);

	let queueMetrics = { isPaused: false, waiting: 0, active: 0, completed: 0, failed: 0, redisConnected: false };
	try {
		const statusRes = await fetch(`${API_URL}/ia/queue/status`);
		if (!statusRes.ok) throw new Error('Status request failed');
		const status = await statusRes.json();
		queueMetrics = {
			isPaused: !!status.isPaused,
			waiting: Number(status.waiting ?? 0),
			active: Number(status.active ?? 0),
			completed: Number(status.completed ?? 0),
			failed: Number(status.failed ?? 0),
			redisConnected: true,
		};
	} catch (err) {
		queueMetrics.redisConnected = false;
	}

	return {
		...runtime,
		selectedTripId,
		selectedDetail,
		queueMetrics,
	};
}

module.exports = {
	fetchJson,
	postTelemetry,
	buildTripDetail,
	buildDashboardSnapshot,
};
