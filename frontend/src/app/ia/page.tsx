"use client";

import { FormEvent, useMemo, useState } from "react";
import RouteMap from "../../components/RouteMap";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

type Waypoint = { lat: number; lon: number };

type AnalysisResult = {
  nivel_riesgo: "CRITICO" | "ALTO" | "MODERADO" | "DESCONOCIDO";
  diagnostico_tecnico: string;
  accion_mitigacion: string;
  fuente: "reglas" | "llm";
  contexto?: {
    limite_max_temp: number;
    temperatura_actual: number;
    bateria_actual: number;
    desvio_km?: number | null;
    distancia_ruta_km?: number | null;
    osrm_usado: boolean;
  };
};

type Status = { type: "success" | "error"; message: string } | null;

const demoRoute: Waypoint[] = [
  { lat: 13.6929, lon: -89.2182 },
  { lat: 13.7001, lon: -89.2045 },
  { lat: 13.7085, lon: -89.1882 },
  { lat: 13.7154, lon: -89.1741 },
];

const riskClassNames: Record<AnalysisResult["nivel_riesgo"], string> = {
  CRITICO: "border-rose-400/40 bg-rose-500/10 text-rose-100",
  ALTO: "border-amber-400/40 bg-amber-500/10 text-amber-100",
  MODERADO: "border-cyan-400/40 bg-cyan-500/10 text-cyan-100",
  DESCONOCIDO: "border-slate-400/40 bg-slate-500/10 text-slate-100",
};

export default function IaPage() {
  const [iotId, setIotId] = useState("iot-demo-01");
  const [viajeId, setViajeId] = useState("");
  const [temperaturaActual, setTemperaturaActual] = useState("6.4");
  const [bateriaActual, setBateriaActual] = useState("78");
  const [limiteMaxTemp, setLimiteMaxTemp] = useState("5");
  const [margenDesvioKm, setMargenDesvioKm] = useState("8");
  const [latitudActual, setLatitudActual] = useState("13.7050");
  const [longitudActual, setLongitudActual] = useState("-89.1962");
  const [modo, setModo] = useState<"auto" | "deterministic" | "llm">("auto");
  const [waypoints, setWaypoints] = useState<Waypoint[]>(demoRoute);
  const [status, setStatus] = useState<Status>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const routePreview = useMemo(() => JSON.stringify({ waypoints }, null, 2), [waypoints]);

  const loadDemo = (scenario: "normal" | "desvio" | "critico") => {
    if (scenario === "normal") {
      setIotId("iot-demo-01");
      setViajeId("");
      setTemperaturaActual("4.2");
      setBateriaActual("81");
      setLimiteMaxTemp("5");
      setMargenDesvioKm("8");
      setLatitudActual("13.7044");
      setLongitudActual("-89.1969");
      setModo("deterministic");
      setWaypoints(demoRoute);
      return;
    }

    if (scenario === "desvio") {
      setIotId("iot-demo-02");
      setViajeId("");
      setTemperaturaActual("5.8");
      setBateriaActual("62");
      setLimiteMaxTemp("5");
      setMargenDesvioKm("4");
      setLatitudActual("13.7315");
      setLongitudActual("-89.2578");
      setModo("auto");
      setWaypoints([
        { lat: 13.6929, lon: -89.2182 },
        { lat: 13.7001, lon: -89.2045 },
        { lat: 13.7085, lon: -89.1882 },
      ]);
      return;
    }

    setIotId("iot-demo-03");
    setViajeId("");
    setTemperaturaActual("11.4");
    setBateriaActual("9");
    setLimiteMaxTemp("5");
    setMargenDesvioKm("4");
    setLatitudActual("13.7441");
    setLongitudActual("-89.2752");
    setModo("auto");
    setWaypoints([
      { lat: 13.6929, lon: -89.2182 },
      { lat: 13.7001, lon: -89.2045 },
      { lat: 13.7085, lon: -89.1882 },
      { lat: 13.7154, lon: -89.1741 },
    ]);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setStatus(null);

    try {
      const response = await fetch(`${API_URL}/ia/analizar-viaje`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          iot_id: iotId,
          viaje_id: viajeId || undefined,
          temperaturaActual: Number(temperaturaActual),
          bateriaActual: Number(bateriaActual),
          limite_max_temp: Number(limiteMaxTemp),
          margen_desvio_km: Number(margenDesvioKm),
          latitudActual: Number(latitudActual),
          longitudActual: Number(longitudActual),
          ruta_waypoints: { waypoints },
          modo,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "No se pudo analizar el escenario.");
      }

      const data = (await response.json()) as AnalysisResult;
      setResult(data);
      setStatus({ type: "success", message: "Analisis generado correctamente." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado.";
      setStatus({ type: "error", message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-10 px-6 py-14">
        <header className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
          <div className="rounded-[2rem] border border-cyan-400/20 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.18),_transparent_42%),linear-gradient(180deg,rgba(15,23,42,0.92),rgba(15,23,42,0.72))] p-8 shadow-2xl shadow-cyan-950/30">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-300">
              Prueba IA
            </p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl">
              Analiza un incidente con ruta, temperatura y desvio OSRM.
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
              Esta pantalla te deja probar el analisis sin depender del flujo completo.
              Si el backend tiene Groq configurado, se usa el modelo; si no, cae al motor
              determinista con la misma salida estructurada.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => loadDemo("normal")}
                className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/20"
              >
                Cargar caso normal
              </button>
              <button
                type="button"
                onClick={() => loadDemo("desvio")}
                className="rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-400/20"
              >
                Cargar desvio
              </button>
              <button
                type="button"
                onClick={() => loadDemo("critico")}
                className="rounded-full border border-rose-400/30 bg-rose-400/10 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-400/20"
              >
                Cargar critico
              </button>
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-800 bg-slate-900/70 p-6">
            <h2 className="text-lg font-semibold">Como funciona</h2>
            <ul className="mt-4 space-y-3 text-sm text-slate-300">
              <li>1. Dibujas o cargas una ruta de referencia.</li>
              <li>2. Envias temperatura, bateria y posicion actual.</li>
              <li>3. El backend calcula desvio y consulta OSRM si la ruta tiene waypoints.</li>
              <li>4. Si hay LLM configurado, refina el texto; si no, usa reglas reproducibles.</li>
            </ul>
          </div>
        </header>

        {status && (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm ${
              status.type === "success"
                ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
                : "border-rose-400/30 bg-rose-500/10 text-rose-100"
            }`}
          >
            {status.message}
          </div>
        )}

        <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <form onSubmit={handleSubmit} className="rounded-[2rem] border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-cyan-950/10">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-semibold text-slate-200">
                IoT ID
                <input
                  value={iotId}
                  onChange={(event) => setIotId(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
                  placeholder="iot-123"
                  required
                />
              </label>
              <label className="text-sm font-semibold text-slate-200">
                Viaje ID
                <input
                  value={viajeId}
                  onChange={(event) => setViajeId(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
                  placeholder="Opcional"
                />
              </label>
              <label className="text-sm font-semibold text-slate-200">
                Temperatura actual
                <input
                  value={temperaturaActual}
                  onChange={(event) => setTemperaturaActual(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
                  type="number"
                  step="0.1"
                  required
                />
              </label>
              <label className="text-sm font-semibold text-slate-200">
                Bateria actual
                <input
                  value={bateriaActual}
                  onChange={(event) => setBateriaActual(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
                  type="number"
                  min="0"
                  max="100"
                  required
                />
              </label>
              <label className="text-sm font-semibold text-slate-200">
                Limite max temp
                <input
                  value={limiteMaxTemp}
                  onChange={(event) => setLimiteMaxTemp(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
                  type="number"
                  step="0.1"
                  required
                />
              </label>
              <label className="text-sm font-semibold text-slate-200">
                Margen desvio km
                <input
                  value={margenDesvioKm}
                  onChange={(event) => setMargenDesvioKm(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
                  type="number"
                  step="0.1"
                  required
                />
              </label>
              <label className="text-sm font-semibold text-slate-200">
                Latitud actual
                <input
                  value={latitudActual}
                  onChange={(event) => setLatitudActual(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
                  type="number"
                  step="0.000001"
                  required
                />
              </label>
              <label className="text-sm font-semibold text-slate-200">
                Longitud actual
                <input
                  value={longitudActual}
                  onChange={(event) => setLongitudActual(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
                  type="number"
                  step="0.000001"
                  required
                />
              </label>
            </div>

            <label className="mt-4 block text-sm font-semibold text-slate-200">
              Modo de analisis
              <select
                value={modo}
                onChange={(event) => setModo(event.target.value as typeof modo)}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
              >
                <option value="auto">Auto</option>
                <option value="deterministic">Deterministico</option>
                <option value="llm">LLM</option>
              </select>
            </label>

            <div className="mt-5 rounded-3xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300">
                    Ruta base
                  </p>
                  <h3 className="mt-1 text-lg font-semibold">Mapa editable para probar OSRM</h3>
                </div>
                <p className="text-xs text-slate-400">Click en el mapa para agregar puntos.</p>
              </div>
              <div className="mt-4 h-72 overflow-hidden rounded-2xl border border-slate-800">
                <RouteMap
                  waypoints={waypoints}
                  routePreviewApiUrl={API_URL}
                  onAddWaypoint={(point) => setWaypoints((current) => [...current, point])}
                />
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setWaypoints(demoRoute)}
                  className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200"
                >
                  Restaurar ruta demo
                </button>
                <button
                  type="button"
                  onClick={() => setWaypoints([])}
                  className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200"
                >
                  Limpiar ruta
                </button>
              </div>
              <textarea
                value={routePreview}
                readOnly
                className="mt-4 h-40 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 font-mono text-xs text-slate-200 outline-none"
              />
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center justify-center rounded-full bg-cyan-400 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? "Analizando..." : "Analizar evento"}
              </button>
            </div>
          </form>

          <aside className="space-y-6">
            <div className="rounded-[2rem] border border-slate-800 bg-slate-900/70 p-6">
              <h2 className="text-lg font-semibold">Resultado</h2>
              {result ? (
                <div className={`mt-4 rounded-3xl border p-4 ${riskClassNames[result.nivel_riesgo]}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs font-semibold uppercase tracking-[0.3em]">
                      {result.nivel_riesgo}
                    </span>
                    <span className="rounded-full border border-white/10 px-3 py-1 text-xs">
                      {result.fuente}
                    </span>
                  </div>
                  <p className="mt-4 text-sm leading-6">{result.diagnostico_tecnico}</p>
                  <p className="mt-4 text-sm leading-6 text-white/90">{result.accion_mitigacion}</p>
                  {result.contexto && (
                    <dl className="mt-5 grid gap-3 text-xs text-white/80 sm:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-black/10 p-3">
                        <dt className="text-white/50">Temperatura</dt>
                        <dd className="mt-1 text-sm font-semibold">
                          {result.contexto.temperatura_actual}°C
                        </dd>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/10 p-3">
                        <dt className="text-white/50">Bateria</dt>
                        <dd className="mt-1 text-sm font-semibold">
                          {result.contexto.bateria_actual}%
                        </dd>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/10 p-3">
                        <dt className="text-white/50">Desvio</dt>
                        <dd className="mt-1 text-sm font-semibold">
                          {result.contexto.desvio_km != null
                            ? `${result.contexto.desvio_km.toFixed(2)} km`
                            : "N/A"}
                        </dd>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/10 p-3">
                        <dt className="text-white/50">OSRM</dt>
                        <dd className="mt-1 text-sm font-semibold">
                          {result.contexto.osrm_usado ? "Si" : "No"}
                        </dd>
                      </div>
                    </dl>
                  )}
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-400">
                  Todavia no ejecutaste ningun analisis. Carga un escenario demo o completa el formulario.
                </p>
              )}
            </div>

            <div className="rounded-[2rem] border border-slate-800 bg-slate-900/70 p-6">
              <h2 className="text-lg font-semibold">Datos utiles</h2>
              <div className="mt-4 space-y-3 text-sm text-slate-300">
                <p>OSRM: {process.env.NEXT_PUBLIC_OSRM_URL ?? "usa el backend por defecto"}</p>
                <p>API: {API_URL}</p>
                <p>
                  Si no hay modelo configurado, la respuesta sigue siendo estable para pruebas y demo.
                </p>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}
