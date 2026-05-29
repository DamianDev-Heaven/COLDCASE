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
		backendEstado: viaje.estado || 'pendiente',
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
		gateOpenTicks: 0,
		offlineBuffer: [],
	};
}

function ensureTripState(viaje, simulationMap) {
	const existingState = simulationMap.get(viaje.id);
	const routePoints = parseRoutePoints(viaje.ruta_waypoints);

	if (!existingState) {
		const state = createTripState(viaje);
		simulationMap.set(viaje.id, state);
		return state;
	}

	existingState.routePoints = routePoints;
	existingState.backendEstado = viaje.estado || existingState.backendEstado || 'pendiente';
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

function advanceRouteState(state, runtimeState) {
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
		return true;
	}

	if (state.progressIndex <= 0) {
		state.progressIndex = 0;
		state.direction = 1;
	}

	return false;
}

function buildSample(viaje, state, runtimeState, logEvent) {
	const routePosition = getRoutePosition(state);
	const limitMaxTemp = asNumber(viaje.limite_max_temp, 5);
	const limitMinTemp = viaje.limite_min_temp == null ? limitMaxTemp - 3 : asNumber(viaje.limite_min_temp, limitMaxTemp - 3);

	const targetTemp = (limitMinTemp + limitMaxTemp) / 2;
	const ambientTemp = 28.0;

	let temp = state.lastPayload ? state.lastPayload.temp : targetTemp;

	if (state.gateOpenTicks === undefined) {
		state.gateOpenTicks = 0;
	}

	if (runtimeState.gateOpeningEnabled !== false && state.gateOpenTicks === 0 && !state.compressorFailed) {
		const rand = Math.random();
		const baseProbability = runtimeState.turboMode ? 0.0015 : 0.006;
		if (rand < baseProbability) {
			state.gateOpenTicks = 4;
			logEvent('warn', `Simulador: Apertura de Compuerta detectada en viaje ${viaje.id}. Infiltración térmica externa activa.`, viaje.id);
		}
	}

	let heatTransferCoef = 0.01;
	let coolingPower = 0.35;

	if (state.compressorFailed) {
		coolingPower = 0.0;
		heatTransferCoef = 0.08;
	}

	const compuerta_abierta = state.gateOpenTicks > 0;
	if (state.gateOpenTicks > 0) {
		heatTransferCoef = 0.35;
		if (!state.compressorFailed) {
			coolingPower = 0.02;
		}
		state.gateOpenTicks -= 1;
	}

	const heatLeakage = (ambientTemp - temp) * heatTransferCoef;
	const coolingRestoration = (targetTemp - temp) * coolingPower;
	const noise = (Math.random() - 0.5) * 0.3;

	temp += heatLeakage + coolingRestoration + noise;
	temp = Number(temp.toFixed(1));

	const humidity = Number(clamp(66 + Math.cos((state.telemetryCount + state.routeSeed) / 3.2) * 7, 35, 94).toFixed(1));
	const batteryDrain = state.routeSeed % 3 === 0 ? 1.8 : 0.9;
	const battery = Math.max(0, Math.min(100, Math.round(state.battery - batteryDrain)));

	// 1. Calculate trip-based smooth drift (different lane, driving patterns, etc.)
	// We use state.routeSeed and state.progressIndex to calculate a deterministic but unique smooth offset.
	// 1 meter ≈ 0.000009 degrees. Let's make the max wave amplitude about 8-15 meters (~0.00008 - 0.00014 degrees).
	const waveFreq = 0.05 + ((state.routeSeed % 13) * 0.03);
	const waveAmpLat = 0.00006 + ((state.routeSeed % 7) * 0.00002);
	const waveAmpLon = 0.00006 + ((state.routeSeed % 11) * 0.00002);

	const driftLat = Math.sin(state.progressIndex * waveFreq) * waveAmpLat;
	const driftLon = Math.cos(state.progressIndex * waveFreq) * waveAmpLon;

	// 2. High-frequency GPS jitter (simulating sensor inaccuracy of 5-15 meters)
	// We use Math.random() so it's always dynamic and looks different on every simulation tick/run
	const jitterLat = (Math.random() - 0.5) * 0.00010;
	const jitterLon = (Math.random() - 0.5) * 0.00010;

	let finalLat = routePosition.lat + driftLat + jitterLat;
	let finalLon = routePosition.lon + driftLon + jitterLon;

	// 3. Deviation handling
	if (state.routeDeviated) {
		// If deviated, add a significant off-route offset (e.g. ~1.5 km) that moves dynamically
		const devOffsetLat = 0.015 + Math.sin(state.telemetryCount * 0.1) * 0.002;
		const devOffsetLon = -0.015 + Math.cos(state.telemetryCount * 0.1) * 0.002;
		finalLat += devOffsetLat;
		finalLon += devOffsetLon;
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
		compuerta_abierta,
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

module.exports = {
	hashString,
	clamp,
	asNumber,
	parseRoutePoints,
	createTripState,
	ensureTripState,
	getRoutePosition,
	advanceRouteState,
	buildSample,
};
