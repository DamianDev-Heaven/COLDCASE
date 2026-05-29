"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ShieldCheck, Cpu, Radio, ChevronDown, CheckCircle2, ArrowRight } from "lucide-react";
import { API_URL } from "@/lib/config";
import { apiFetch } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Viaje {
  id: string;
  estado: string;
  tipo_producto: string;
  origen_nombre: string;
  destino_nombre: string;
  transporte_placa: string;
  limite_max_temp: number;
  limite_min_temp?: number;
}

interface Incidente {
  id: string;
  resuelta: boolean;
  tipo_alerta: string;
  timestamp_bd: string;
  umbral_permitido: number;
  valor_detectado: number;
  comentario_resolucion?: string | null;
}

type SimState = {
  iotFailure: boolean;
  paused: boolean;
  turboMode: boolean;
  trip: {
    viajeId: string;
    compressorFailed: boolean;
    routeDeviated: boolean;
    gateOpenTicks: number;
    offlineBufferLength: number;
    status: string;
  } | null;
} | null;

// ─── Component ────────────────────────────────────────────────────────────────

export default function IaPage() {
  // ── Control state ─────────────────────────────────────────────────────────
  const [viajes, setViajes] = useState<Viaje[]>([]);
  const [viajeSeleccionado, setViajeSeleccionado] = useState<Viaje | null>(null);
  const [dropOpen, setDropOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const [simState, setSimState] = useState<SimState>(null);
  const [incidentes, setIncidentes] = useState<Incidente[]>([]);
  const [incFilter, setIncFilter] = useState<"activas" | "resueltas" | "todas">("activas");

  // Load active trips for control tab
  useEffect(() => {
    async function cargarViajes() {
      try {
        const res = await apiFetch(`${API_URL}/viaje`);
        if (res.ok) {
          const data = await res.json();
          const activos = data.filter(
            (v: Viaje) => v.estado === "pendiente" || v.estado === "en_curso"
          );
          setViajes(activos);
          setViajeSeleccionado((prev) => {
            if (prev) {
              const actualizado = data.find((v: Viaje) => v.id === prev.id);
              if (actualizado && actualizado.estado !== prev.estado) {
                return actualizado;
              }
              return prev;
            }
            return activos.length > 0 ? activos[0] : null;
          });
        }
      } catch (e) {
        console.error("Error cargando viajes:", e);
      }
    }
    cargarViajes();
    const iv = setInterval(cargarViajes, 8000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll simulator state
  useEffect(() => {
    if (!viajeSeleccionado?.id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSimState(null);
      return;
    }
    const id = viajeSeleccionado.id;
    async function cargarSim() {
      try {
        const res = await apiFetch(`${API_URL}/viaje/${id}/simulador-estado`);
        if (res.ok) setSimState(await res.json());
      } catch {}
    }
    cargarSim();
    const iv = setInterval(cargarSim, 4000);
    return () => clearInterval(iv);
  }, [viajeSeleccionado?.id]);

  // Poll incidents
  useEffect(() => {
    if (!viajeSeleccionado?.id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIncidentes([]);
      return;
    }
    const id = viajeSeleccionado.id;
    async function cargarInc() {
      try {
        const res = await apiFetch(`${API_URL}/incidente/viaje/${id}`);
        if (res.ok) {
          const data = await res.json();
          setIncidentes(Array.isArray(data) ? data : []);
        }
      } catch {}
    }
    cargarInc();
    const iv = setInterval(cargarInc, 5000);
    return () => clearInterval(iv);
  }, [viajeSeleccionado?.id]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSimCommand = async (comando: string, enabled?: boolean) => {
    if (!viajeSeleccionado?.id) return;
    try {
      const res = await apiFetch(`${API_URL}/viaje/${viajeSeleccionado.id}/comando-simulador`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comando, enabled }),
      });
      if (res.ok) {
        const resSim = await apiFetch(`${API_URL}/viaje/${viajeSeleccionado.id}/simulador-estado`);
        if (resSim.ok) setSimState(await resSim.json());
      }
    } catch (e) {
      console.error("Error comando sim:", e);
    }
  };

  const handleResolveIncident = async (id: string, comentario: string) => {
    try {
      const res = await apiFetch(`${API_URL}/incidente/${id}/resolver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comentario }),
      });
      if (res.ok && viajeSeleccionado?.id) {
        const resInc = await apiFetch(`${API_URL}/incidente/viaje/${viajeSeleccionado.id}`);
        if (resInc.ok) {
          const d = await resInc.json();
          setIncidentes(Array.isArray(d) ? d : []);
        }
      }
    } catch (e) {
      console.error("Error resolviendo incidente:", e);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-6 py-10">

        {/* Header */}
        <header className="flex items-center justify-between gap-4 flex-wrap border-b border-white/[0.05] pb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-cyan-500/20 to-indigo-500/20 border border-cyan-500/20 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/5">
              <ShieldCheck className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <span className="text-[13px] font-extrabold tracking-widest text-white">COLD<span className="text-cyan-400">CASE</span></span>
              <p className="text-[9px] text-slate-500 tracking-[0.12em] uppercase mt-0.5">Control · Sandbox</p>
            </div>
          </div>
          <Link
            href="/dashboard"
            className="rounded-full border border-slate-700 bg-slate-900/50 hover:bg-slate-900 px-5 py-2 text-xs font-semibold text-slate-200 transition hover:border-cyan-400/40"
          >
            Volver al Dashboard
          </Link>
        </header>

        <div className="flex flex-col gap-6">

          {/* Hero strip */}
          <div className="rounded-[2rem] border border-rose-400/15 bg-[radial-gradient(circle_at_top_left,_rgba(239,68,68,0.12),_transparent_50%),linear-gradient(180deg,rgba(15,23,42,0.95),rgba(15,23,42,0.80))] p-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-rose-300">Sandbox · Control de Viaje</p>
              <h2 className="mt-2 text-2xl font-semibold">Simulación e Inyección de Fallas</h2>
              <p className="mt-1.5 text-sm text-slate-400">Selecciona un despacho activo para controlar el simulador, gestionar alertas y enviar comandos Downlink.</p>
            </div>

            {/* Trip selector */}
            <div className="relative" ref={dropRef}>
              <button
                onClick={() => setDropOpen((o) => !o)}
                className="flex items-center gap-2 bg-slate-900 border border-white/10 hover:border-cyan-500/30 rounded-xl px-4 py-2.5 text-[11px] font-semibold text-slate-200 transition cursor-pointer min-w-[220px] justify-between"
              >
                <span className="truncate">
                  {viajeSeleccionado
                    ? `${viajeSeleccionado.transporte_placa} · ${viajeSeleccionado.tipo_producto}`
                    : "Seleccionar despacho..."}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-500 shrink-0 transition-transform ${dropOpen ? "rotate-180" : ""}`} />
              </button>
              {dropOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 w-64 bg-slate-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden">
                  {viajes.length === 0 ? (
                    <p className="text-center text-slate-600 text-xs py-4 font-mono">Sin despachos activos.</p>
                  ) : (
                    viajes.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => { setViajeSeleccionado(v); setDropOpen(false); }}
                        className={`w-full text-left px-4 py-3 text-[11px] font-medium hover:bg-slate-800 transition cursor-pointer flex flex-col gap-0.5 border-b border-white/[0.04] last:border-0 ${v.id === viajeSeleccionado?.id ? "text-cyan-300" : "text-slate-300"}`}
                      >
                        <span className="font-bold font-mono">{v.transporte_placa}</span>
                        <span className="text-slate-500">{v.tipo_producto} · {v.origen_nombre} → {v.destino_nombre}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {!viajeSeleccionado ? (
            <div className="rounded-[2rem] border border-slate-800 bg-slate-900/40 p-16 flex flex-col items-center gap-3 text-center">
              <Cpu className="w-10 h-10 text-slate-700" />
              <p className="text-sm text-slate-500 font-mono">Selecciona un despacho activo para comenzar.</p>
            </div>
          ) : viajeSeleccionado.estado === "finalizado" ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-in fade-in duration-300">
              {/* Celebration & Details */}
              <div className="md:col-span-2 bg-slate-900/40 border border-white/[0.06] rounded-[1.5rem] p-8 flex flex-col gap-6 items-center justify-center min-h-[520px] text-center">
                <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/5">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 animate-bounce" />
                </div>
                
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Despacho Completado</span>
                  <h2 className="mt-2 text-2xl font-bold">¡Destino Alcanzado con Éxito!</h2>
                  <p className="mt-2 text-sm text-slate-400 max-w-md">
                    El viaje del vehículo <strong className="text-white font-mono">{viajeSeleccionado.transporte_placa}</strong> ha finalizado. La cadena de frío ha sido completada para este despacho.
                  </p>
                </div>

                {/* Details box */}
                <div className="w-full max-w-md bg-slate-950/40 border border-white/[0.04] rounded-2xl p-5 text-left grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Producto</span>
                    <p className="text-xs font-semibold text-slate-200 mt-0.5">{viajeSeleccionado.tipo_producto}</p>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Límite de Temp</span>
                    <p className="text-xs font-semibold text-slate-200 mt-0.5">{viajeSeleccionado.limite_max_temp}°C</p>
                  </div>
                  <div className="col-span-2 border-t border-white/[0.03] pt-3">
                    <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Ruta Realizada</span>
                    <div className="text-xs font-semibold text-slate-200 mt-1.5 flex items-center gap-1.5 flex-wrap">
                      <span>{viajeSeleccionado.origen_nombre}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                      <span>{viajeSeleccionado.destino_nombre}</span>
                    </div>
                  </div>
                </div>

                {/* Next actions */}
                <div className="w-full max-w-md flex flex-col gap-3">
                  {viajes.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Selecciona otro despacho en curso:</p>
                      <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-1">
                        {viajes.map((v) => (
                          <button
                            key={v.id}
                            onClick={() => setViajeSeleccionado(v)}
                            className="w-full text-left px-4 py-3 rounded-xl bg-slate-950/30 border border-white/5 hover:border-cyan-500/20 hover:bg-slate-950/60 transition cursor-pointer flex items-center justify-between text-xs"
                          >
                            <div className="flex flex-col gap-0.5">
                              <span className="font-bold font-mono text-slate-200">{v.transporte_placa}</span>
                              <span className="text-[10px] text-slate-500">{v.tipo_producto}</span>
                            </div>
                            <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider flex items-center gap-1">
                              Monitorear <ArrowRight className="w-3 h-3" />
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 items-center">
                      <p className="text-xs text-slate-500 font-mono">No hay otros viajes activos en este momento.</p>
                      <Link
                        href="/dashboard"
                        className="rounded-full bg-slate-900 border border-white/10 hover:border-cyan-500/20 px-5 py-2 text-xs font-semibold text-slate-300 transition"
                      >
                        Ir al Dashboard Principal
                      </Link>
                    </div>
                  )}
                </div>
              </div>

              {/* Bitácora de incidentes (auditoría de cierre) */}
              <div className="bg-slate-900/40 border border-white/[0.06] rounded-[1.5rem] p-4 flex flex-col gap-3 min-h-[520px]">
                <div className="flex items-center justify-between border-b border-white/[0.05] pb-3 shrink-0 gap-2 flex-wrap">
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    Bitácora de Cierre
                    <span className="bg-slate-800 text-slate-400 rounded-full px-2 py-0.5 text-[8px] font-mono">
                      {incidentes.filter((i) => !i.resuelta).length} activas · {incidentes.filter((i) => i.resuelta).length} resueltas
                    </span>
                  </h3>
                </div>

                <div className="flex gap-1 shrink-0">
                  {(["activas", "resueltas", "todas"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setIncFilter(f)}
                      className={`px-2.5 py-1 rounded-lg text-[8px] font-bold uppercase tracking-wide transition cursor-pointer ${
                        incFilter === f
                          ? f === "activas" ? "bg-rose-500/15 text-rose-300 border border-rose-500/20"
                            : f === "resueltas" ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20"
                            : "bg-slate-700/50 text-slate-200 border border-slate-600/30"
                          : "text-slate-600 hover:text-slate-400 border border-transparent"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 no-scrollbar">
                  {(() => {
                    const filtered = incidentes.filter((i) =>
                      incFilter === "activas" ? !i.resuelta :
                      incFilter === "resueltas" ? i.resuelta : true
                    );
                    return (
                      <>
                        {filtered.map((inc) => (
                          <div
                            key={inc.id}
                            className={`p-3 rounded-xl border text-xs flex flex-col gap-2 transition-all ${inc.resuelta ? "bg-emerald-950/5 border-emerald-500/10 text-slate-500" : "bg-rose-950/10 border-rose-500/20 text-slate-200"}`}
                          >
                            <div className="flex justify-between items-center">
                              <span className={`font-mono text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${inc.resuelta ? "bg-emerald-950/50 text-emerald-400 border-emerald-800/20" : "bg-rose-950/50 text-rose-400 border-rose-800/20"}`}>
                                {inc.tipo_alerta}
                              </span>
                              <span className="text-[8px] font-mono text-slate-500">
                                {new Date(inc.timestamp_bd).toLocaleTimeString()}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Límite: <strong className="font-mono">{inc.umbral_permitido}°C</strong> | Leído:{" "}
                              <strong className={`font-mono ${inc.resuelta ? "text-slate-400" : "text-rose-400"}`}>{inc.valor_detectado}°C</strong>
                            </div>
                            {inc.resuelta ? (
                              <div className="bg-slate-950/40 border border-white/5 rounded-lg p-2 text-[9px] italic text-slate-400">
                                <span className="font-semibold text-emerald-400 not-italic block mb-0.5">✔ Resuelto:</span>
                                &ldquo;{inc.comentario_resolucion}&rdquo;
                              </div>
                            ) : (
                              <div className="flex flex-col gap-1.5 pt-1.5 border-t border-white/5">
                                <span className="text-[8px] font-semibold text-slate-500">Bitácora de cierre:</span>
                                <div className="flex gap-1.5">
                                  <input
                                    type="text"
                                    id={`res-note-${inc.id}`}
                                    placeholder="Ej. Chofer reporta cierre de compuerta."
                                    className="flex-1 bg-slate-950/60 border border-white/10 rounded-lg px-2 py-1 text-[9px] text-white outline-none focus:border-cyan-500/40"
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        handleResolveIncident(inc.id, e.currentTarget.value);
                                        e.currentTarget.value = "";
                                      }
                                    }}
                                  />
                                  <button
                                    onClick={() => {
                                      const el = document.getElementById(`res-note-${inc.id}`) as HTMLInputElement;
                                      if (el) { handleResolveIncident(inc.id, el.value); el.value = ""; }
                                    }}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg px-2.5 py-1 text-[8px] uppercase tracking-wide cursor-pointer transition-all"
                                  >
                                    Ok
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                        {filtered.length === 0 && (
                          <div className="h-full flex items-center justify-center text-center text-slate-600 text-[10px] font-mono py-12">
                            {incFilter === "activas" ? "Sin alertas activas 🎉" : incFilter === "resueltas" ? "Sin alertas cerradas." : "Sin incidentes."}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

              {/* COL 1: ALERTS LOG */}
              <div className="bg-slate-900/40 border border-white/[0.06] rounded-[1.5rem] p-4 flex flex-col gap-3 min-h-[520px]">
                <div className="flex items-center justify-between border-b border-white/[0.05] pb-3 shrink-0 gap-2 flex-wrap">
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500" />
                    </span>
                    Bitácora
                    <span className="bg-slate-800 text-slate-400 rounded-full px-2 py-0.5 text-[8px] font-mono">
                      {incidentes.filter((i) => !i.resuelta).length} activas · {incidentes.filter((i) => i.resuelta).length} cerradas
                    </span>
                  </h3>
                  {incidentes.filter((i) => !i.resuelta).length > 0 && (
                    <button
                      onClick={async () => {
                        if (!confirm(`¿Cerrar las ${incidentes.filter((i) => !i.resuelta).length} alertas activas de este despacho?`)) return;
                        try {
                          await apiFetch(`${API_URL}/incidente/viaje/${viajeSeleccionado!.id}/resolver-todas`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ comentario: "Cierre masivo por el operador" }),
                          });
                          const res = await apiFetch(`${API_URL}/incidente/viaje/${viajeSeleccionado!.id}`);
                          if (res.ok) setIncidentes(await res.json());
                        } catch (e) { console.error(e); }
                      }}
                      className="text-[8px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-lg bg-rose-950/40 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition cursor-pointer"
                    >
                      Cerrar todas
                    </button>
                  )}
                </div>

                {/* Filter tabs */}
                <div className="flex gap-1 shrink-0">
                  {(["activas", "resueltas", "todas"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setIncFilter(f)}
                      className={`px-2.5 py-1 rounded-lg text-[8px] font-bold uppercase tracking-wide transition cursor-pointer ${
                        incFilter === f
                          ? f === "activas" ? "bg-rose-500/15 text-rose-300 border border-rose-500/20"
                            : f === "resueltas" ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20"
                            : "bg-slate-700/50 text-slate-200 border border-slate-600/30"
                          : "text-slate-600 hover:text-slate-400 border border-transparent"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 no-scrollbar">
                  {(() => {
                    const filtered = incidentes.filter((i) =>
                      incFilter === "activas" ? !i.resuelta :
                      incFilter === "resueltas" ? i.resuelta : true
                    );
                    const visible = filtered.slice(0, 20);
                    return (
                      <>
                        {visible.map((inc) => (
                          <div
                            key={inc.id}
                            className={`p-3 rounded-xl border text-xs flex flex-col gap-2 transition-all ${inc.resuelta ? "bg-emerald-950/5 border-emerald-500/10 text-slate-500" : "bg-rose-950/10 border-rose-500/20 text-slate-200"}`}
                          >
                            <div className="flex justify-between items-center">
                              <span className={`font-mono text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${inc.resuelta ? "bg-emerald-950/50 text-emerald-400 border-emerald-800/20" : "bg-rose-950/50 text-rose-400 border-rose-800/20"}`}>
                                {inc.tipo_alerta}
                              </span>
                              <span className="text-[8px] font-mono text-slate-500">
                                {new Date(inc.timestamp_bd).toLocaleTimeString()}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Límite: <strong className="font-mono">{inc.umbral_permitido}°C</strong> | Leído:{" "}
                              <strong className={`font-mono ${inc.resuelta ? "text-slate-400" : "text-rose-400"}`}>{inc.valor_detectado}°C</strong>
                            </div>
                            {inc.resuelta ? (
                              <div className="bg-slate-950/40 border border-white/5 rounded-lg p-2 text-[9px] italic text-slate-400">
                                <span className="font-semibold text-emerald-400 not-italic block mb-0.5">✔ Resuelto:</span>
                                &ldquo;{inc.comentario_resolucion}&rdquo;
                              </div>
                            ) : (
                              <div className="flex flex-col gap-1.5 pt-1.5 border-t border-white/5">
                                <span className="text-[8px] font-semibold text-slate-500">Bitácora de cierre:</span>
                                <div className="flex gap-1.5">
                                  <input
                                    type="text"
                                    id={`res-note-${inc.id}`}
                                    placeholder="Ej. Chofer reporta cierre de compuerta."
                                    className="flex-1 bg-slate-950/60 border border-white/10 rounded-lg px-2 py-1 text-[9px] text-white outline-none focus:border-cyan-500/40"
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        handleResolveIncident(inc.id, e.currentTarget.value);
                                        e.currentTarget.value = "";
                                      }
                                    }}
                                  />
                                  <button
                                    onClick={() => {
                                      const el = document.getElementById(`res-note-${inc.id}`) as HTMLInputElement;
                                      if (el) { handleResolveIncident(inc.id, el.value); el.value = ""; }
                                    }}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg px-2.5 py-1 text-[8px] uppercase tracking-wide cursor-pointer transition-all"
                                  >
                                    Ok
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                        {filtered.length > 20 && (
                          <div className="text-center text-[9px] font-mono text-slate-500 py-2 border border-dashed border-slate-700 rounded-xl">
                            +{filtered.length - 20} más · usa &quot;Cerrar todas&quot; para limpiar masivamente
                          </div>
                        )}
                        {filtered.length === 0 && (
                          <div className="h-full flex items-center justify-center text-center text-slate-600 text-[10px] font-mono py-12">
                            {incFilter === "activas" ? "Sin alertas activas 🎉" : incFilter === "resueltas" ? "Sin alertas cerradas." : "Sin incidentes."}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* COL 2: DOWNLINK MITIGATION */}
              <div className="bg-slate-900/40 border border-white/[0.06] rounded-[1.5rem] p-4 flex flex-col gap-3 min-h-[520px]">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2 border-b border-white/[0.05] pb-3 shrink-0">
                  <Radio className="w-3.5 h-3.5 text-cyan-400" />
                  Comandos Downlink IoT
                </h3>

                <div className="flex-1 flex flex-col gap-3 justify-center">
                  {/* Compressor */}
                  <DownlinkCard
                    label="Compresor Principal"
                    statusActive={!!simState?.trip?.compressorFailed}
                    statusLabel={simState?.trip?.compressorFailed ? "FALLA" : "NORMAL"}
                    buttonLabel="Encender Compresor"
                    disabled={!simState?.trip?.compressorFailed}
                    onClick={() => handleSimCommand("encender-compresor")}
                  />
                  {/* Route */}
                  <DownlinkCard
                    label="Trayecto OSRM"
                    statusActive={!!simState?.trip?.routeDeviated}
                    statusLabel={simState?.trip?.routeDeviated ? "DESVIADO" : "EN RUTA"}
                    buttonLabel="Reincorporar a Ruta"
                    disabled={!simState?.trip?.routeDeviated}
                    onClick={() => handleSimCommand("corregir-desvio")}
                  />
                  {/* Gate */}
                  <DownlinkCard
                    label="Cierre Compuerta"
                    statusActive={!!(simState?.trip?.gateOpenTicks && simState.trip.gateOpenTicks > 0)}
                    statusLabel={(simState?.trip?.gateOpenTicks && simState.trip.gateOpenTicks > 0) ? "ABIERTA" : "CERRADA"}
                    buttonLabel="Cerrar Compuerta"
                    disabled={!(simState?.trip?.gateOpenTicks && simState.trip.gateOpenTicks > 0)}
                    onClick={() => handleSimCommand("cerrar-compuerta")}
                  />
                </div>

                {/* Sim status strip */}
                {simState && (
                  <div className="mt-auto pt-3 border-t border-white/[0.05] grid grid-cols-2 gap-2">
                    {[
                      { label: "Estado", value: simState.trip?.status || "—" },
                      { label: "Buffer offline", value: String(simState.trip?.offlineBufferLength || 0) },
                      { label: "Pausado", value: simState.paused ? "Sí" : "No" },
                      { label: "Turbo", value: simState.turboMode ? "Sí" : "No" },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-slate-950/40 border border-white/[0.04] rounded-xl p-2">
                        <p className="text-[8px] text-slate-500 uppercase font-bold tracking-wider">{label}</p>
                        <p className="text-[10px] font-mono text-slate-300 mt-0.5">{value}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* COL 3: FAULT INJECTION */}
              <div className="bg-slate-900/40 border border-white/[0.06] rounded-[1.5rem] p-4 flex flex-col gap-3 min-h-[520px]">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2 border-b border-white/[0.05] pb-3 shrink-0">
                  <Cpu className="w-3.5 h-3.5 text-rose-400" />
                  Inyección de Fallas
                  <span className="ml-auto text-[8px] text-rose-400/60 font-mono">SANDBOX ONLY</span>
                </h3>

                <div className="flex-1 flex flex-col gap-3 justify-center">
                  <FaultToggle
                    label="Falla Compresor"
                    description="Apaga el motor térmico"
                    active={!!simState?.trip?.compressorFailed}
                    onToggle={() => handleSimCommand(simState?.trip?.compressorFailed ? "encender-compresor" : "apagar-compresor")}
                  />
                  <FaultToggle
                    label="Desviar Vehículo"
                    description="Saca al camión de ruta OSRM"
                    active={!!simState?.trip?.routeDeviated}
                    onToggle={() => handleSimCommand(simState?.trip?.routeDeviated ? "corregir-desvio" : "provocar-desvio")}
                  />
                  <FaultToggle
                    label="Pérdida de Señal"
                    description={`Store & Forward${(simState?.trip?.offlineBufferLength || 0) > 0 ? ` (${simState?.trip?.offlineBufferLength} en búfer)` : ""}`}
                    active={!!simState?.iotFailure}
                    onToggle={() => handleSimCommand("toggle-signal-loss", !simState?.iotFailure)}
                    color="amber"
                  />
                  <FaultToggle
                    label="Abrir Compuerta"
                    description="Apertura no autorizada en tránsito"
                    active={!!(simState?.trip?.gateOpenTicks && simState.trip.gateOpenTicks > 0)}
                    onToggle={() => handleSimCommand(simState?.trip?.gateOpenTicks && simState.trip.gateOpenTicks > 0 ? "cerrar-compuerta" : "abrir-compuerta")}
                  />
                </div>
              </div>

            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DownlinkCard({
  label, statusActive, statusLabel, buttonLabel, disabled, onClick,
}: {
  label: string;
  statusActive: boolean;
  statusLabel: string;
  buttonLabel: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <div className="bg-slate-950/30 border border-white/[0.05] rounded-xl p-3 flex flex-col gap-2">
      <div className="flex justify-between items-center text-[9px]">
        <span className="font-bold text-white uppercase tracking-wider">{label}</span>
        <span className={`font-bold px-1.5 py-0.5 rounded border text-[8px] ${statusActive ? "text-rose-400 bg-rose-950/40 border-rose-900/20" : "text-emerald-400 bg-emerald-950/40 border-emerald-900/20"}`}>
          {statusLabel}
        </span>
      </div>
      <button
        onClick={onClick}
        disabled={disabled}
        className={`w-full font-bold rounded-lg py-2 text-[9px] uppercase tracking-wide transition-all border cursor-pointer ${
          !disabled
            ? "bg-cyan-600 hover:bg-cyan-700 text-white border-cyan-500"
            : "bg-slate-950/20 text-slate-600 border-white/5 cursor-not-allowed"
        }`}
      >
        {buttonLabel}
      </button>
    </div>
  );
}

function FaultToggle({
  label, description, active, disabled = false, onToggle, color = "rose",
}: {
  label: string;
  description: string;
  active: boolean;
  disabled?: boolean;
  onToggle: () => void;
  color?: "rose" | "amber";
}) {
  const activeStyle = color === "amber"
    ? "bg-amber-600 border-amber-500 text-white shadow-lg shadow-amber-500/20"
    : "bg-rose-600 border-rose-500 text-white shadow-lg shadow-rose-500/20";
  return (
    <div className="flex justify-between items-center bg-slate-950/30 p-3 border border-white/[0.05] rounded-xl text-[9px]">
      <div className="flex flex-col gap-0.5">
        <span className="font-bold text-white leading-snug">{label}</span>
        <span className="text-[7.5px] text-slate-500 font-mono">{description}</span>
      </div>
      <button
        onClick={onToggle}
        disabled={disabled}
        className={`px-3 py-1.5 rounded-lg font-bold uppercase tracking-wide border text-[8px] transition-all ${
          disabled
            ? "bg-rose-950/30 border-rose-900/10 text-rose-600 cursor-not-allowed"
            : active
              ? activeStyle + " cursor-pointer"
              : "bg-slate-950 hover:bg-slate-800 text-slate-400 border-white/10 cursor-pointer"
        }`}
      >
        {disabled ? "Activa" : active ? "Desactivar" : "Simular"}
      </button>
    </div>
  );
}
