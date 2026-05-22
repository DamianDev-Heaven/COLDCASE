"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import RouteMap from "../../components/RouteMap";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

type Empresa = { id: string; nombre: string };
type Iot = {
  id: string;
  tipo_dispositivo: string;
  estado_conexion: string;
  ultimo_ping: string;
  firmware_version?: string | null;
};
type Transporte = {
  id: string;
  placa: string;
  iot_id: string;
  empresa_id: string;
  estado: "Activo" | "Mantenimiento";
  capacidad?: number | null;
};
type Viaje = {
  id: string;
  transporte_id: string;
  limite_max_temp: number;
  ruta_waypoints: Record<string, unknown>;
  margen_desvio_km?: number | null;
  inicio_viaje?: string | null;
  final_viaje?: string | null;
  estado: "pendiente" | "en_curso" | "pausado" | "cancelado" | "finalizado";
};

type Status = { type: "success" | "error"; message: string } | null;

type Waypoint = { lat: number; lon: number };

export default function SetupPage() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [iots, setIots] = useState<Iot[]>([]);
  const [transportes, setTransportes] = useState<Transporte[]>([]);
  const [viajes, setViajes] = useState<Viaje[]>([]);

  const [empresaNombre, setEmpresaNombre] = useState("");
  const [iotTipo, setIotTipo] = useState("");
  const [iotEstado, setIotEstado] = useState("Conectado");
  const [iotFirmware, setIotFirmware] = useState("");

  const [transportePlaca, setTransportePlaca] = useState("");
  const [transporteIotId, setTransporteIotId] = useState("");
  const [transporteEmpresaId, setTransporteEmpresaId] = useState("");
  const [transporteEstado, setTransporteEstado] = useState<"Activo" | "Mantenimiento">("Activo");
  const [transporteCapacidad, setTransporteCapacidad] = useState("");

  const [viajeTransporteId, setViajeTransporteId] = useState("");
  const [viajeLimiteTemp, setViajeLimiteTemp] = useState("5");
  const [viajeRuta, setViajeRuta] = useState("{\"waypoints\": []}");
  const [viajeMargen, setViajeMargen] = useState("10");
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);

  const [status, setStatus] = useState<Status>(null);

  const statusClass = useMemo(() => {
    if (!status) return "";
    return status.type === "success"
      ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
      : "border-rose-400/40 bg-rose-500/10 text-rose-100";
  }, [status]);

  const loadAll = async () => {
    const [empresaRes, iotRes, transporteRes, viajeRes] = await Promise.all([
      fetch(`${API_URL}/empresa`),
      fetch(`${API_URL}/iot`),
      fetch(`${API_URL}/transporte`),
      fetch(`${API_URL}/viaje`),
    ]);

    const [empresaData, iotData, transporteData, viajeData] = await Promise.all([
      empresaRes.json(),
      iotRes.json(),
      transporteRes.json(),
      viajeRes.json(),
    ]);

    setEmpresas(empresaData);
    setIots(iotData);
    setTransportes(transporteData);
    setViajes(viajeData);
  };

  useEffect(() => {
    loadAll().catch(() => {
      setStatus({
        type: "error",
        message: "No se pudo cargar la informacion. Verifica el backend.",
      });
    });
  }, []);

  const handleEmpresa = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(null);

    const response = await fetch(`${API_URL}/empresa`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: empresaNombre }),
    });

    if (!response.ok) {
      setStatus({ type: "error", message: "No se pudo crear la empresa." });
      return;
    }

    setEmpresaNombre("");
    await loadAll();
    setStatus({ type: "success", message: "Empresa creada correctamente." });
  };

  const handleIot = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(null);

    const response = await fetch(`${API_URL}/iot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo_dispositivo: iotTipo,
        estado_conexion: iotEstado,
        ultimo_ping: new Date().toISOString(),
        firmware_version: iotFirmware || null,
      }),
    });

    if (!response.ok) {
      setStatus({ type: "error", message: "No se pudo crear el dispositivo IoT." });
      return;
    }

    setIotTipo("");
    setIotFirmware("");
    await loadAll();
    setStatus({ type: "success", message: "Dispositivo IoT creado." });
  };

  const handleTransporte = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(null);

    const response = await fetch(`${API_URL}/transporte`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        placa: transportePlaca,
        iot_id: transporteIotId,
        empresa_id: transporteEmpresaId,
        estado: transporteEstado,
        capacidad: transporteCapacidad ? Number(transporteCapacidad) : null,
      }),
    });

    if (!response.ok) {
      setStatus({ type: "error", message: "No se pudo crear el transporte." });
      return;
    }

    setTransportePlaca("");
    setTransporteIotId("");
    setTransporteEmpresaId("");
    setTransporteCapacidad("");
    await loadAll();
    setStatus({ type: "success", message: "Transporte creado." });
  };

  const handleViaje = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(null);

    let ruta: Record<string, unknown> = {};
    try {
      ruta = JSON.parse(viajeRuta);
    } catch {
      setStatus({ type: "error", message: "La ruta debe ser JSON valido." });
      return;
    }

    const response = await fetch(`${API_URL}/viaje`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transporte_id: viajeTransporteId,
        limite_max_temp: Number(viajeLimiteTemp),
        ruta_waypoints: ruta,
        margen_desvio_km: viajeMargen ? Number(viajeMargen) : null,
      }),
    });

    if (!response.ok) {
      setStatus({ type: "error", message: "No se pudo crear el viaje." });
      return;
    }

    setViajeTransporteId("");
    await loadAll();
    setStatus({ type: "success", message: "Viaje creado." });
  };

  const handleClearRoute = () => {
    setWaypoints([]);
    setViajeRuta("{\"waypoints\": []}");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-10 px-6 py-16">
        <header className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">
            Configuracion Inicial
          </p>
          <h1 className="text-3xl font-semibold">Carga base para empresas y viajes</h1>
          <p className="text-slate-300">
            Usa estos formularios para crear empresa, IoT, transporte y viaje.
          </p>
          <a href="/ia" className="w-fit text-sm font-semibold text-cyan-300 underline-offset-4 hover:underline">
            Abrir analizador IA con ruta OSRM
          </a>
        </header>

        {status && (
          <div className={`rounded-2xl border px-4 py-3 text-sm ${statusClass}`}>
            {status.message}
          </div>
        )}

        <section className="grid gap-6 lg:grid-cols-2">
          <form onSubmit={handleEmpresa} className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
            <h2 className="text-xl font-semibold">Empresa</h2>
            <input
              value={empresaNombre}
              onChange={(event) => setEmpresaNombre(event.target.value)}
              placeholder="Nombre de empresa"
              className="mt-4 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
              required
            />
            <button
              type="submit"
              className="mt-4 rounded-full bg-cyan-400 px-5 py-2 text-sm font-semibold text-slate-900"
            >
              Crear empresa
            </button>
          </form>

          <form onSubmit={handleIot} className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
            <h2 className="text-xl font-semibold">Dispositivo IoT</h2>
            <input
              value={iotTipo}
              onChange={(event) => setIotTipo(event.target.value)}
              placeholder="Tipo de dispositivo"
              className="mt-4 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
              required
            />
            <input
              value={iotEstado}
              onChange={(event) => setIotEstado(event.target.value)}
              placeholder="Estado de conexion"
              className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
              required
            />
            <input
              value={iotFirmware}
              onChange={(event) => setIotFirmware(event.target.value)}
              placeholder="Firmware (opcional)"
              className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
            />
            <button
              type="submit"
              className="mt-4 rounded-full bg-cyan-400 px-5 py-2 text-sm font-semibold text-slate-900"
            >
              Crear IoT
            </button>
          </form>

          <form onSubmit={handleTransporte} className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
            <h2 className="text-xl font-semibold">Transporte</h2>
            <input
              value={transportePlaca}
              onChange={(event) => setTransportePlaca(event.target.value)}
              placeholder="Placa"
              className="mt-4 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
              required
            />
            <select
              value={transporteEmpresaId}
              onChange={(event) => setTransporteEmpresaId(event.target.value)}
              className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
              required
            >
              <option value="">Empresa</option>
              {empresas.map((empresa) => (
                <option key={empresa.id} value={empresa.id}>
                  {empresa.nombre}
                </option>
              ))}
            </select>
            <select
              value={transporteIotId}
              onChange={(event) => setTransporteIotId(event.target.value)}
              className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
              required
            >
              <option value="">IoT</option>
              {iots.map((iot) => (
                <option key={iot.id} value={iot.id}>
                  {iot.tipo_dispositivo} ({iot.estado_conexion})
                </option>
              ))}
            </select>
            <select
              value={transporteEstado}
              onChange={(event) => setTransporteEstado(event.target.value as "Activo" | "Mantenimiento")}
              className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
            >
              <option value="Activo">Activo</option>
              <option value="Mantenimiento">Mantenimiento</option>
            </select>
            <input
              value={transporteCapacidad}
              onChange={(event) => setTransporteCapacidad(event.target.value)}
              placeholder="Capacidad (opcional)"
              className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
            />
            <button
              type="submit"
              className="mt-4 rounded-full bg-cyan-400 px-5 py-2 text-sm font-semibold text-slate-900"
            >
              Crear transporte
            </button>
          </form>

          <form onSubmit={handleViaje} className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
            <h2 className="text-xl font-semibold">Viaje</h2>
            <select
              value={viajeTransporteId}
              onChange={(event) => setViajeTransporteId(event.target.value)}
              className="mt-4 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
              required
            >
              <option value="">Transporte</option>
              {transportes.map((transporte) => (
                <option key={transporte.id} value={transporte.id}>
                  {transporte.placa}
                </option>
              ))}
            </select>
            <input
              value={viajeLimiteTemp}
              onChange={(event) => setViajeLimiteTemp(event.target.value)}
              placeholder="Limite max temp"
              className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
              required
            />
            <input
              value={viajeMargen}
              onChange={(event) => setViajeMargen(event.target.value)}
              placeholder="Margen desvio km"
              className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
            />
            <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
              <p className="text-xs text-slate-400">
                Haz click en el mapa para agregar waypoints. El JSON se actualiza automaticamente.
              </p>
              <div className="mt-3 h-64 overflow-hidden rounded-xl">
                <RouteMap
                  waypoints={waypoints}
                  routePreviewApiUrl={API_URL}
                  onAddWaypoint={(point) => {
                    const next = [...waypoints, point];
                    setWaypoints(next);
                    setViajeRuta(JSON.stringify({ waypoints: next }, null, 2));
                  }}
                />
              </div>
              <button
                type="button"
                onClick={handleClearRoute}
                className="mt-3 rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200"
              >
                Limpiar ruta
              </button>
              <textarea
                value={viajeRuta}
                readOnly
                className="mt-3 h-32 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-xs text-slate-200"
              />
            </div>
            <button
              type="submit"
              className="mt-4 rounded-full bg-cyan-400 px-5 py-2 text-sm font-semibold text-slate-900"
            >
              Crear viaje
            </button>
          </form>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
            <h3 className="text-lg font-semibold">Empresas ({empresas.length})</h3>
            <ul className="mt-4 space-y-2 text-sm text-slate-200">
              {empresas.map((empresa) => (
                <li key={empresa.id} className="rounded-xl border border-slate-800 px-3 py-2">
                  {empresa.nombre}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
            <h3 className="text-lg font-semibold">IoT ({iots.length})</h3>
            <ul className="mt-4 space-y-2 text-sm text-slate-200">
              {iots.map((iot) => (
                <li key={iot.id} className="rounded-xl border border-slate-800 px-3 py-2">
                  {iot.tipo_dispositivo} - {iot.estado_conexion}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
            <h3 className="text-lg font-semibold">Transportes ({transportes.length})</h3>
            <ul className="mt-4 space-y-2 text-sm text-slate-200">
              {transportes.map((transporte) => (
                <li key={transporte.id} className="rounded-xl border border-slate-800 px-3 py-2">
                  {transporte.placa} - {transporte.estado}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
            <h3 className="text-lg font-semibold">Viajes ({viajes.length})</h3>
            <ul className="mt-4 space-y-2 text-sm text-slate-200">
              {viajes.map((viaje) => (
                <li key={viaje.id} className="rounded-xl border border-slate-800 px-3 py-2">
                  {viaje.estado} - limite {viaje.limite_max_temp}°C
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
