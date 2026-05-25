"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import RouteMap from "../../components/RouteMap";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

type TelemetriaRecord = {
  id: number;
  viaje_id: string;
  lat: string;
  lon: string;
  temp: string;
  humedad: number | null;
  bateria: number | null;
  timestamp_sensor: string;
  received_at: string;
  incidente_id?: string | null;
  tipo_alerta?: "TEMP_ALTA" | "FUERA_RUTA" | "BATERIA_BAJA" | null;
  valor_detectado?: number | null;
  umbral_permitido?: number | null;
  timestamp_bd?: string | null;
};

type IncidenteRecord = {
  id: string;
  viaje_id: string;
  telemetria_id: number;
  tipo_alerta: "TEMP_ALTA" | "FUERA_RUTA" | "BATERIA_BAJA";
  valor_detectado: number;
  umbral_permitido: number;
  timestamp_bd: string;
};

type ViajeRecord = {
  id: string;
  transporte_id: string;
  limite_max_temp: number;
  ruta_waypoints:
    | {
        type?: string;
        features?: Array<{
          geometry?: {
            coordinates?: Array<[number, number]>;
          };
        }>;
      }
    | Array<{ lat: number; lon: number }>;
  margen_desvio_km: number | null;
  inicio_viaje: string | null;
  final_viaje: string | null;
  estado: "pendiente" | "en_curso" | "pausado" | "cancelado" | "finalizado";
};

type Status = { type: "success" | "error"; message: string } | null;

const badgeClassNames: Record<IncidenteRecord["tipo_alerta"], string> = {
  TEMP_ALTA: "border-rose-400/30 bg-rose-500/10 text-rose-100",
  FUERA_RUTA: "border-amber-400/30 bg-amber-500/10 text-amber-100",
  BATERIA_BAJA: "border-cyan-400/30 bg-cyan-500/10 text-cyan-100",
};

export default function TelemetriaPage() {
  const [viajeId, setViajeId] = useState("");
  const [viajes, setViajes] = useState<ViajeRecord[]>([]);
  const [selectedViajeId, setSelectedViajeId] = useState("");
  const [lat, setLat] = useState("13.692900");
  const [lon, setLon] = useState("-89.218200");
  const [temp, setTemp] = useState("4.8");
  const [humedad, setHumedad] = useState("61");
  const [bateria, setBateria] = useState("84");
  const [timestampSensor, setTimestampSensor] = useState(new Date().toISOString());
  const [status, setStatus] = useState<Status>(null);
  const [loading, setLoading] = useState(false);
  const [telemetria, setTelemetria] = useState<TelemetriaRecord[]>([]);
  const [incidentes, setIncidentes] = useState<IncidenteRecord[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const hasAlertas = useMemo(
    () => incidentes.some((incidente) => incidente.tipo_alerta === "TEMP_ALTA"),
    [incidentes],
  );

  const loadData = async () => {
    setLoadingData(true);

    try {
      const [telemetriaResponse, incidentesResponse, viajesResponse] = await Promise.all([
        fetch(`${API_URL}/telemetria`),
        fetch(`${API_URL}/incidente`),
        fetch(`${API_URL}/viaje`),
      ]);

      if (telemetriaResponse.ok) {
        const telemetriaData = (await telemetriaResponse.json()) as TelemetriaRecord[];
        setTelemetria(Array.isArray(telemetriaData) ? telemetriaData : []);
      }

      if (incidentesResponse.ok) {
        const incidentesData = (await incidentesResponse.json()) as IncidenteRecord[];
        setIncidentes(Array.isArray(incidentesData) ? incidentesData : []);
      }

      if (viajesResponse.ok) {
        const viajesData = (await viajesResponse.json()) as ViajeRecord[];
        setViajes(Array.isArray(viajesData) ? viajesData : []);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudieron cargar los datos de telemetría.";
      setStatus({ type: "error", message });
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!selectedViajeId && viajes.length > 0) {
      setSelectedViajeId(viajes[0].id);
      setViajeId(viajes[0].id);
    }
  }, [selectedViajeId, viajes]);

  const selectedViaje = useMemo(() => viajes.find((v) => v.id === selectedViajeId) ?? null, [selectedViajeId, viajes]);

  const selectedWaypoints = useMemo(() => {
    if (!selectedViaje) return [];
    if (Array.isArray(selectedViaje.ruta_waypoints)) return selectedViaje.ruta_waypoints.map((p: any) => ({ lat: p.lat, lon: p.lon }));
    const coordinates = selectedViaje.ruta_waypoints.features?.[0]?.geometry?.coordinates ?? [];
    return coordinates.map(([lon, lat]: [number, number]) => ({ lat, lon }));
  }, [selectedViaje]);

  const selectedIncidentMarkers = useMemo(() =>
    incidentes
      .filter((inc) => inc.viaje_id === selectedViajeId)
      .flatMap((inc) => {
        const t = telemetria.find((tt) => tt.id === inc.telemetria_id);
        if (!t) return [];
        return [
          {
            id: inc.id,
            lat: Number(t.lat),
            lon: Number(t.lon),
            label: `${inc.tipo_alerta} · ${Number(inc.valor_detectado).toFixed(1)} / ${Number(inc.umbral_permitido).toFixed(1)}`,
            accent: (inc.tipo_alerta === "TEMP_ALTA" ? "rose" : inc.tipo_alerta === "FUERA_RUTA" ? "amber" : "cyan") as "rose" | "amber" | "cyan",
          },
        ];
      }),
    [incidentes, selectedViajeId, telemetria],
  );

  const loadDemo = (scenario: "normal" | "alerta" | "bateria") => {
    setViajeId("11111111-1111-1111-1111-111111111111");

    if (scenario === "normal") {
      setLat("13.692900");
      setLon("-89.218200");
      setTemp("4.6");
      setHumedad("62");
      setBateria("84");
      return;
    }

    if (scenario === "alerta") {
      setLat("13.731500");
      setLon("-89.257800");
      setTemp("12");
      setHumedad("70");
      setBateria("58");
      return;
    }

    setLat("13.744100");
    setLon("-89.275200");
    setTemp("5.1");
    setHumedad("58");
    setBateria("5");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setStatus(null);

    try {
      const response = await fetch(`${API_URL}/telemetria`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          viaje_id: viajeId,
          lat: Number(lat),
          lon: Number(lon),
          temp: Number(temp),
          humedad: humedad === "" ? undefined : Number(humedad),
          bateria: bateria === "" ? undefined : Number(bateria),
          timestamp_sensor: timestampSensor,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "No se pudo registrar la telemetría.");
      }

      const record = (await response.json()) as TelemetriaRecord;
      setStatus({
        type: record.incidente_id ? "error" : "success",
        message: record.incidente_id
          ? "Temperatura crítica detectada y incidente sellado."
          : "Telemetría registrada correctamente.",
      });

      await loadData();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado.";
      setStatus({ type: "error", message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.16),_transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(244,114,182,0.1),_transparent_30%)]" />
      <main className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-6 py-12">
        <header className="grid gap-6 lg:grid-cols-[1.3fr_0.9fr]">
          <div className="rounded-[2rem] border border-cyan-400/20 bg-[linear-gradient(180deg,rgba(15,23,42,0.95),rgba(15,23,42,0.72))] p-8 shadow-2xl shadow-cyan-950/20">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-300">Telemetría en ruta</p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl">Registro operativo de temperatura, humedad y batería.</h1>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
              Cada muestra viaja al backend, se guarda en la base de datos y, si supera el umbral de temperatura, queda sellado un incidente de auditoría.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" onClick={() => loadDemo("normal")} className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/20">Caso normal</button>
              <button type="button" onClick={() => loadDemo("alerta")} className="rounded-full border border-rose-400/30 bg-rose-400/10 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-400/20">Caso crítico</button>
              <button type="button" onClick={() => loadDemo("bateria")} className="rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-400/20">Batería baja</button>
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-800 bg-slate-900/70 p-6">
            <h2 className="text-lg font-semibold">Estado auditable</h2>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <p className="text-slate-400">Telemetrías</p>
                <p className="mt-2 text-2xl font-semibold">{telemetria.length}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <p className="text-slate-400">Incidentes</p>
                <p className={`mt-2 text-2xl font-semibold ${hasAlertas ? "text-rose-100" : "text-emerald-100"}`}>{incidentes.length}</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              El incidente no depende de la IA: la IA puede ayudar a interpretar, pero el registro inmutable sale de la telemetría y del módulo de incidente.
            </p>
          </div>
        </header>

        {status && (
          <div className={`rounded-2xl border px-4 py-3 text-sm ${status.type === "success" ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100" : "border-rose-400/30 bg-rose-500/10 text-rose-100"}`}>
            {status.message}
          </div>
        )}

        <section className="grid gap-6 xl:grid-cols-[0.98fr_1.02fr]">
          <form onSubmit={handleSubmit} className="rounded-[2rem] border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-cyan-950/10">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">Nueva muestra</p>
                <h2 className="mt-2 text-2xl font-semibold">Enviar telemetría al backend</h2>
              </div>
              <Link href="/dashboard" className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500">Volver al dashboard</Link>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-semibold text-slate-200 md:col-span-2">
                Viaje registrado
                <select
                  value={selectedViajeId}
                  onChange={(event) => {
                    setSelectedViajeId(event.target.value);
                    setViajeId(event.target.value);
                  }}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
                >
                  <option value="">Selecciona un viaje</option>
                  {viajes.map((viaje) => (
                    <option key={viaje.id} value={viaje.id}>
                      {viaje.id} · {viaje.estado} · {Number(viaje.limite_max_temp).toFixed(1)}°C
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-200 md:col-span-2">
                Viaje ID
                <input value={viajeId} onChange={(event) => setViajeId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-300" placeholder="UUID del viaje" required />
              </label>
              <label className="text-sm font-semibold text-slate-200">
                Latitud
                <input value={lat} onChange={(event) => setLat(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-300" type="number" step="0.000001" required />
              </label>
              <label className="text-sm font-semibold text-slate-200">
                Longitud
                <input value={lon} onChange={(event) => setLon(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-300" type="number" step="0.000001" required />
              </label>
              <label className="text-sm font-semibold text-slate-200">
                Temperatura
                <input value={temp} onChange={(event) => setTemp(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-300" type="number" step="0.1" required />
              </label>
              <label className="text-sm font-semibold text-slate-200">
                Humedad
                <input value={humedad} onChange={(event) => setHumedad(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-300" type="number" min="0" max="100" step="0.1" />
              </label>
              <label className="text-sm font-semibold text-slate-200">
                Batería
                <input value={bateria} onChange={(event) => setBateria(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-300" type="number" min="0" max="100" step="1" />
              </label>
              <label className="text-sm font-semibold text-slate-200 md:col-span-2">
                Timestamp del sensor
                <input value={timestampSensor} onChange={(event) => setTimestampSensor(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-300" type="datetime-local" />
              </label>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button type="submit" disabled={loading} className="inline-flex items-center justify-center rounded-full bg-cyan-400 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-70">
                {loading ? "Enviando..." : "Registrar telemetría"}
              </button>
              <button type="button" onClick={loadData} className="rounded-full border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-cyan-400/40 hover:bg-slate-900">Refrescar auditoría</button>
            </div>
          </form>

          <div className="grid gap-6">
            <section className="rounded-[2rem] border border-slate-800 bg-slate-900/70 p-6">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xl font-semibold">Incidentes recientes</h3>
                <span className="text-sm text-slate-400">{loadingData ? "Cargando..." : `${incidentes.length} registros`}</span>
              </div>

              <div className="mt-5 h-80 overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/70">
                <RouteMap
                  waypoints={selectedWaypoints}
                  incidentMarkers={selectedIncidentMarkers}
                  center={selectedWaypoints[0] ? [selectedWaypoints[0].lat, selectedWaypoints[0].lon] : [13.6929, -89.2182]}
                  zoom={selectedWaypoints.length > 0 ? 13 : 12}
                />
              </div>

              <div className="mt-5 space-y-3">
                {incidentes.length === 0 ? (
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">Aún no hay incidentes sellados.</div>
                ) : (
                  incidentes.slice(0, 5).map((incidente) => (
                    <article key={incidente.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{incidente.id}</p>
                          <h4 className="mt-2 text-base font-semibold">Viaje {incidente.viaje_id}</h4>
                        </div>
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${badgeClassNames[incidente.tipo_alerta]}`}>{incidente.tipo_alerta}</span>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-3 text-sm text-slate-300">
                        <div>
                          <p className="text-slate-500">Detectado</p>
                          <p className="mt-1 font-semibold text-slate-100">{incidente.valor_detectado}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Umbral</p>
                          <p className="mt-1 font-semibold text-slate-100">{incidente.umbral_permitido}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Fecha</p>
                          <p className="mt-1 font-semibold text-slate-100">{new Date(incidente.timestamp_bd).toLocaleString()}</p>
                        </div>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-[2rem] border border-slate-800 bg-slate-900/70 p-6">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xl font-semibold">Últimas telemetrías</h3>
                <span className="text-sm text-slate-400">{loadingData ? "Cargando..." : `${telemetria.length} muestras`}</span>
              </div>

              <div className="mt-5 space-y-3">
                {telemetria.length === 0 ? (
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">No hay muestras registradas todavía.</div>
                ) : (
                  telemetria.slice(0, 6).map((item) => (
                    <article key={item.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Telemetría #{item.id}</p>
                          <h4 className="mt-2 text-base font-semibold">Viaje {item.viaje_id}</h4>
                        </div>
                        <div className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
                          {item.incidente_id ? "Con incidente" : "Sin alerta"}
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-4 text-sm text-slate-300">
                        <div><p className="text-slate-500">Temp</p><p className="mt-1 font-semibold text-slate-100">{Number(item.temp).toFixed(1)}°C</p></div>
                        <div><p className="text-slate-500">Humedad</p><p className="mt-1 font-semibold text-slate-100">{item.humedad ?? "N/A"}%</p></div>
                        <div><p className="text-slate-500">Batería</p><p className="mt-1 font-semibold text-slate-100">{item.bateria ?? "N/A"}%</p></div>
                        <div><p className="text-slate-500">Hora</p><p className="mt-1 font-semibold text-slate-100">{new Date(item.received_at).toLocaleString()}</p></div>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}