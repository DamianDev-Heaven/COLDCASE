"use client";

import { useEffect, useMemo, useState } from "react";
import RouteMap from "@/components/RouteMap";
import AiInsightsPanel from "@/components/AiInsightsPanel";
import TelemetryChart from "@/components/TelemetryChart";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
const SIMULATOR_URL = process.env.NEXT_PUBLIC_SIMULADOR_URL || "http://localhost:4000";

type Sucursal = {
  id: string;
  empresa_id: string;
  empresa_nombre: string;
  nombre: string;
  direccion?: string | null;
  lat: number;
  lon: number;
};

interface Viaje {
  id: string;
  estado: string;
  tipo_producto: string;
  valor_comercial: number;
  peso_kg: number;
  volumen_m3: number;
  limite_max_temp: number;
  limite_min_temp?: number;
  inicio_viaje?: string | null;
  final_viaje?: string | null;
  auditoria_ia?: string | null;
  transporte_id: string;
  transporte_placa: string;
  origen_id: string;
  origen_nombre: string;
  destino_id: string;
  destino_nombre: string;
  sucursal_origen_id?: string;
  sucursal_destino_id?: string;
  ruta_waypoints?: unknown;
  margen_desvio_km?: number;
}

interface Transporte {
  id: string;
  placa: string;
  capacidad_carga_kg: number;
  empresa_nombre: string;
  empresa_id: string;
  iot_id: string;
  estado: string;
}

interface TelemetryPoint {
  id?: string | number;
  viaje_id: string;
  lat: number | string;
  lon: number | string;
  temp: number;
  humedad?: number | null;
  bateria?: number | null;
  timestamp_sensor: string;
  received_at?: string;
  ia_diagnosis?: string | null;
}

// ========================================================
// COMPONENTE PRINCIPAL (DASHBOARD V2)
// ========================================================
export default function DashboardV2() {
  const [viajes, setViajes] = useState<Viaje[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [transportes, setTransportes] = useState<Transporte[]>([]);
  const [viajeSeleccionado, setViajeSeleccionado] = useState<Viaje | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"overview" | "timeline">("overview");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [telemetryList, setTelemetryList] = useState<TelemetryPoint[]>([]);



  // Estados para el formulario real de nuevo envío (Modal con campos añadidos)
  const [transporteIdForm, setTransporteIdForm] = useState("");
  const [sucursalOrigenIdForm, setSucursalOrigenIdForm] = useState("");
  const [sucursalDestinoIdForm, setSucursalDestinoIdForm] = useState("");
  const [tipoProductoForm, setTipoProductoForm] = useState("");
  const [valorComercialForm, setValorComercialForm] = useState("");
  const [pesoKgForm, setPesoKgForm] = useState("");
  const [volumenM3Form, setVolumenM3Form] = useState("");
  const [limiteMaxTempForm, setLimiteMaxTempForm] = useState("5");
  const [limiteMinTempForm, setLimiteMinTempForm] = useState("1");
  const [estadoForm, setEstadoForm] = useState<"pendiente" | "en_curso">("pendiente");

  const resetModalForm = () => {
    setTransporteIdForm("");
    setSucursalOrigenIdForm("");
    setSucursalDestinoIdForm("");
    setTipoProductoForm("");
    setValorComercialForm("");
    setPesoKgForm("");
    setVolumenM3Form("");
    setLimiteMaxTempForm("5");
    setLimiteMinTempForm("1");
    setEstadoForm("pendiente");
    setSubmitError(null);
  };

  // 📍 RUTA DEL VIAJE SELECCIONADO EN LA LISTA LATERAL (Crucial para el mapa interactivo)
  const waypointsViajeActivo = useMemo(() => {
    if (!viajeSeleccionado || sucursales.length === 0) return [];
    
    const origen = sucursales.find((s) => s.id === viajeSeleccionado.sucursal_origen_id);
    const destino = sucursales.find((s) => s.id === viajeSeleccionado.sucursal_destino_id);
    
    if (!origen || !destino) return [];
    return [
      { lat: Number(origen.lat), lon: Number(origen.lon) },
      { lat: Number(destino.lat), lon: Number(destino.lon) },
    ];
  }, [viajeSeleccionado, sucursales]);

  // 📍 RUTA PREVIA DEL FORMULARIO MODAL
  const waypointsFormModal = useMemo(() => {
    const orig = sucursales.find((s) => s.id === sucursalOrigenIdForm);
    const dest = sucursales.find((s) => s.id === sucursalDestinoIdForm);
    if (!orig || !dest) return [];
    return [
      { lat: Number(orig.lat), lon: Number(orig.lon) },
      { lat: Number(dest.lat), lon: Number(dest.lon) },
    ];
  }, [sucursales, sucursalOrigenIdForm, sucursalDestinoIdForm]);



  // Telemetría simulada en base al ID estático de la BD
  const telemetryDataQuery = useMemo(() => {
    if (!viajeSeleccionado) return [];
    if (viajeSeleccionado.id === "77777777-7777-4777-8777-777777777777") {
      return [
        { timestamp_sensor: "2026-05-23T16:00:00Z", temp: 3.8 },
        { timestamp_sensor: "2026-05-23T16:10:00Z", temp: 4.2 },
        { timestamp_sensor: "2026-05-23T16:20:00Z", temp: 6.2 },
        { timestamp_sensor: "2026-05-23T16:30:00Z", temp: 3.5 },
        { timestamp_sensor: "2026-05-23T16:40:00Z", temp: 1.1 },
      ];
    }
    return [
      { timestamp_sensor: "2026-05-23T16:00:00Z", temp: 2.5 },
      { timestamp_sensor: "2026-05-23T16:20:00Z", temp: 3.0 },
      { timestamp_sensor: "2026-05-23T16:40:00Z", temp: 2.8 },
    ];
  }, [viajeSeleccionado]);

  // ✅ DECLARACIÓN CORRECTA DE CONEXIÓN AL BACKEND CON LOS NUEVOS CAMPOS LOGÍSTICOS
  const handleCreateViaje = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);

    if (!transporteIdForm || !sucursalOrigenIdForm || !sucursalDestinoIdForm || !tipoProductoForm || !valorComercialForm) {
      setSubmitError("Completa todos los campos técnicos y comerciales obligatorios.");
      return;
    }

    const payload = {
      transporte_id: transporteIdForm,
      sucursal_origen_id: sucursalOrigenIdForm,
      sucursal_destino_id: sucursalDestinoIdForm,
      tipo_producto: tipoProductoForm,
      valor_comercial: Number(valorComercialForm),
      peso_kg: Number(pesoKgForm || 0),
      volumen_m3: Number(volumenM3Form || 0),
      limite_max_temp: Number(limiteMaxTempForm),
      limite_min_temp: Number(limiteMinTempForm),
      estado: estadoForm,
      ruta_waypoints: {}, // OSRM se calculará de forma nativa en el backend
    };

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/viaje`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error("Error en la respuesta del servidor NestJS");

      const nuevoViaje = await response.json();
      setViajes((current) => [nuevoViaje, ...current]);
      setViajeSeleccionado(nuevoViaje);
      setIsModalOpen(false);
      resetModalForm();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Error inesperado al mapear el envío");
    } finally {
      setIsSubmitting(false);
    }
  };
  async function handleIniciarViaje(viajeId: string) {
  setIsSubmitting(true);
  try {
    const res = await fetch(`${API_URL}/viaje/${viajeId}/iniciar`, { method: 'PATCH' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.message || `Error ${res.status}`);
    }
    const actualizado = await res.json();
    setViajes((cur) => cur.map((v) => (v.id === actualizado.id ? actualizado : v)));
    setViajeSeleccionado(actualizado);
  } catch (error) {
    console.error('Error iniciando viaje:', error);
    alert(error instanceof Error ? error.message : 'No se pudo iniciar el viaje.');
  } finally {
    setIsSubmitting(false);
  }
}

  useEffect(() => {
    async function cargarViajes() {
      try {
        const [viajesRes, transportesRes, sucursalesRes] = await Promise.all([
          fetch(`${API_URL}/viaje`),
          fetch(`${API_URL}/transporte`),
          fetch(`${API_URL}/sucursal`),
        ]);

        const data = await viajesRes.json();
        const transportesData = await transportesRes.json();
        const sucursalesData = await sucursalesRes.json();
        setViajes(data);
        setTransportes(transportesData);
        setSucursales(Array.isArray(sucursalesData) ? sucursalesData : []);
        if (data.length > 0 && !viajeSeleccionado) setViajeSeleccionado(data[0]);
      } catch (error) {
        console.error("Error cargando variables reales:", error);
      } finally {
        setIsLoading(false);
      }
    }
    cargarViajes();
    const interval = setInterval(cargarViajes, 5000);
    return () => clearInterval(interval);
  }, [viajeSeleccionado]);

  useEffect(() => {
    if (!viajeSeleccionado?.id) {
      const timer = setTimeout(() => {
        setTelemetryList([]);
      }, 0);
      return () => clearTimeout(timer);
    }

    const viajeId = viajeSeleccionado.id;
    async function cargarTelemetria() {
      try {
        const res = await fetch(`${API_URL}/telemetria/viaje/${viajeId}`);
        if (res.ok) {
          const data = await res.json();
          const sorted = Array.isArray(data)
            ? (data as TelemetryPoint[]).sort(
                (a: TelemetryPoint, b: TelemetryPoint) =>
                  new Date(a.timestamp_sensor).getTime() - new Date(b.timestamp_sensor).getTime(),
              )
            : [];
          setTelemetryList(sorted);
        }
      } catch (error) {
        console.error("Error cargando telemetria del viaje:", error);
      }
    }

    cargarTelemetria();
    const interval = setInterval(cargarTelemetria, 3000);
    return () => clearInterval(interval);
  }, [viajeSeleccionado?.id]);

  if (isLoading) {
    return (
      <div className="h-screen w-full bg-[#05070f] flex items-center justify-center text-white font-mono text-xs">
        Cargando telemetría de COLDCASE...
      </div>
    );
  }

  return (
    <div className="bg-[#05070f] text-slate-100 h-screen w-full overflow-hidden flex flex-col font-sans antialiased">
      
      {/* HEADER BAR */}
      <header className="bg-[#0a0f1d] fixed top-0 right-0 w-[calc(100%-64px)] z-30 border-b border-white/5 flex justify-between items-center px-6 h-16">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-bold text-white uppercase tracking-wider">Control Panel V2</h1>
          <div className="h-4 w-px bg-slate-800"></div>
          <div className="flex items-center gap-4 font-mono text-[9px] uppercase tracking-wider text-slate-400">
            <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /><span>Back: Online</span></div>
            <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /><span>DB: Persistent</span></div>
          </div>
        </div>
        <button 
          onClick={() => { resetModalForm(); setIsModalOpen(true); }}
          className="bg-[#0ea5e9] text-white hover:opacity-90 px-4 py-1.5 rounded-md text-xs font-bold flex items-center gap-1 transition-all"
        >
          Registrar Envío
        </button>
        <a
          href={SIMULATOR_URL}
          target="_blank"
          rel="noreferrer"
          className="bg-[#0a0f1d] text-slate-100 border border-white/10 hover:border-[#0ea5e9]/40 px-4 py-1.5 rounded-md text-xs font-bold flex items-center gap-1 transition-all"
        >
          Abrir simulador
        </a>
      </header>

      {/* WORKSPACE AREA */}
      <div className="flex h-full pt-16">
        <nav className="bg-[#070a13] fixed left-0 top-0 h-full w-[64px] z-30 border-r border-white/5 flex flex-col items-center py-4 justify-between">
          <div className="w-10 h-10 bg-[#0a0f1d] border border-white/5 rounded-lg flex items-center justify-center font-bold text-[#0ea5e9]">CC</div>
        </nav>

        <main className="flex-1 ml-[64px] flex p-3 gap-3 overflow-hidden h-full">
          
          {/* BARRA LATERAL */}
          <aside className="w-[320px] h-full flex flex-col bg-[#0a0f1d] rounded-xl border border-white/5 overflow-hidden shrink-0">
            <div className="p-3 border-b border-white/5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex justify-between">
                Monitoreo Activo <span className="text-[#0ea5e9]">{viajes.length}</span>
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {viajes.map((viaje) => (
                <div 
                  key={viaje.id}
                  onClick={() => setViajeSeleccionado(viaje)}
                  className={`bg-[#05070f] border rounded-lg p-3 cursor-pointer hover:border-white/10 transition-all ${
                    viajeSeleccionado?.id === viaje.id ? "border-[#0ea5e9]" : "border-white/5"
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-mono text-xs font-bold text-white">#{viaje.id.substring(0, 6).toUpperCase()}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${viaje.estado === 'en_curso' ? "bg-cyan-950/80 text-cyan-400 border border-cyan-800/30" : "bg-[#070a13] text-slate-400 border border-white/5"}`}>{viaje.estado}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-mono">Prod: {viaje.tipo_producto || "No especificado"}</p>
                  <p className="text-[10px] text-slate-500 font-mono">Val: ${Number(viaje.valor_comercial || 0).toLocaleString()}</p>

                  {viaje.estado === 'pendiente' && (
                    <div className="mt-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleIniciarViaje(viaje.id); }}
                        disabled={isSubmitting}
                        className="text-xs font-bold px-3 py-1 rounded bg-amber-500 text-black hover:opacity-90"
                      >
                        {isSubmitting ? 'Iniciando...' : '▶ Iniciar viaje'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </aside>

          {/* AREA CENTRAL: MAPA + APARTADO INFERIOR */}
          <div className="flex-1 flex flex-col gap-3 h-full min-w-0">
            
            {/* MAPA INTERACTIVO CON RUTA PUNTO A PUNTO ACTIVA */}
            <div className="flex-1 bg-[#0a0f1d] rounded-xl border border-white/5 relative overflow-hidden z-10">
              {viajeSeleccionado && waypointsViajeActivo.length === 2 ? (
                <RouteMap 
                  viajeId={viajeSeleccionado.id} 
                  waypoints={waypointsViajeActivo} 
                  routePreviewApiUrl={API_URL} 
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs font-mono">
                  Geolocalizando trayecto OSRM para el viaje seleccionado...
                </div>
              )}
            </div>

            {/* LOWER SPECS TABS */}
            <div className="h-[290px] shrink-0 bg-[#0a0f1d] rounded-xl border border-white/5 flex flex-col overflow-hidden">
              <div className="flex border-b border-white/5 px-4 bg-[#070a13]">
                <button onClick={() => setActiveTab("overview")} className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors ${activeTab === "overview" ? "border-[#0ea5e9] text-white" : "border-transparent text-slate-400"}`}>Historial Térmico</button>
                <button onClick={() => setActiveTab("timeline")} className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors ${activeTab === "timeline" ? "border-[#0ea5e9] text-white" : "border-transparent text-slate-400"}`}>Ficha Despacho</button>
              </div>

              <div className="flex-1 p-4 overflow-y-auto">
                {activeTab === "overview" && viajeSeleccionado && (
                  <div className="flex flex-col md:flex-row gap-4 h-full items-center">
                    <div className="w-full md:w-1/4 bg-[#05070f] border border-white/5 p-3 rounded-lg flex flex-col justify-center h-full">
                      <span className="text-[9px] font-mono text-slate-400 uppercase">Límites de Carga</span>
                      <div className="text-xs font-mono text-red-400 mt-1">Max: {viajeSeleccionado.limite_max_temp || 5}°C</div>
                      <div className="text-xs font-mono text-sky-400">Min: {viajeSeleccionado.limite_min_temp || 1}°C</div>
                      <div className="h-px bg-white/5 my-2" />
                      <span className="text-[9px] font-mono text-slate-500">Masa: {viajeSeleccionado.peso_kg || 0} Kg</span>
                    </div>
                    <div className="flex-1 w-full h-full flex items-center justify-center">
                      <TelemetryChart 
                        telemetryData={telemetryList.length > 0 ? telemetryList : telemetryDataQuery} 
                        limiteMin={Number(viajeSeleccionado.limite_min_temp || 1)} 
                        limiteMax={Number(viajeSeleccionado.limite_max_temp || 5)} 
                      />
                    </div>
                  </div>
                )}

                {activeTab === "timeline" && viajeSeleccionado && (
                  <div className="flex flex-col gap-4 h-full justify-between">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="bg-[#05070f] border border-white/5 p-3 rounded-lg">
                        <span className="text-[9px] font-mono uppercase text-slate-400 block tracking-wider">Valor Asegurado</span>
                        <span className="text-base font-bold text-white mt-0.5 block">
                          ${Number(viajeSeleccionado.valor_comercial || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className={`bg-[#05070f] border p-3 rounded-lg ${viajeSeleccionado.id === "77777777-7777-4777-8777-777777777777" ? "border-red-900/60 text-red-400 animate-pulse" : "border-white/5 text-emerald-400"}`}>
                        <span className="text-[9px] font-mono uppercase text-slate-400 block tracking-wider">Estado de Riesgo</span>
                        <span className="text-base font-bold mt-0.5 block">{viajeSeleccionado.id === "77777777-7777-4777-8777-777777777777" || telemetryList.some((p) => p.temp > (viajeSeleccionado.limite_max_temp || 5) || p.temp < (viajeSeleccionado.limite_min_temp || 1)) ? "CRÍTICO" : "ESTABLE"}</span>
                      </div>
                      <div className="bg-[#05070f] border border-white/5 p-3 rounded-lg">
                        <span className="text-[9px] font-mono uppercase text-slate-400 block tracking-wider">Ocupación de Contenedor</span>
                        <span className="text-base font-bold text-sky-400 mt-0.5 block">{((Number(viajeSeleccionado.peso_kg || 0) / 15000) * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs font-mono border-t border-white/5 pt-3">
                      <div className="flex justify-between"><span className="text-slate-500">Categoría Producto:</span> <span className="text-white font-medium">{viajeSeleccionado.tipo_producto || "N/A"}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Volumen Ocupado:</span> <span className="text-sky-400 font-medium">{viajeSeleccionado.volumen_m3 || 0} m³</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Margen de Desvío:</span> <span className="text-white font-medium">{viajeSeleccionado.margen_desvio_km} Km</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">ID Sucursal Destino:</span> <span className="text-slate-400 text-[11px] truncate w-40 text-right">{viajeSeleccionado.sucursal_destino_id || "N/A"}</span></div>
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* COLUMNA DERECHA: PANEL DE INSIGHTS IA Y AUDITORÍA */}
          <aside className="w-[340px] h-full shrink-0 flex flex-col">
            <AiInsightsPanel 
              viaje={viajeSeleccionado} 
              telemetryList={telemetryList} 
              apiUrl={API_URL} 
            />
          </aside>
        </main>
      </div>

      {/* ========================================================
          MODAL DE REGISTRO EVOLUCIONADO CON LOS NUEVOS CAMPOS
         ======================================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#0a0f1d] border border-white/5 w-[900px] p-5 rounded-xl shadow-2xl relative">
            <button className="absolute top-4 right-4 text-slate-400 hover:text-white" onClick={() => { setIsModalOpen(false); resetModalForm(); }}><span className="material-symbols-outlined">close</span></button>
            <div className="mb-4">
              <h2 className="text-xs font-bold text-white uppercase tracking-wider">Registrar Nuevo Envío Termocontrolado</h2>
            </div>
            
            <div className="flex flex-row gap-4">
              {/* FORMULARIO */}
              <div className="w-[50%] flex flex-col gap-3">
                <form id="new-viaje-form" className="flex flex-col gap-3" onSubmit={handleCreateViaje}>
                  
                  {/* ASIGNACIONES SUCURSALES */}
                  <div className="flex gap-2">
                    <div className="flex-1 flex flex-col gap-1">
                      <label className="text-[9px] uppercase font-mono text-slate-400">Origen (Sucursal)</label>
                      <select value={sucursalOrigenIdForm} onChange={(e) => setSucursalOrigenIdForm(e.target.value)} className="w-full bg-[#05070f] border border-white/5 text-xs text-slate-200 p-2 rounded-md outline-none">
                        <option value="">Seleccionar</option>
                        {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                      </select>
                    </div>
                    <div className="flex-1 flex flex-col gap-1">
                      <label className="text-[9px] uppercase font-mono text-slate-400">Destino (Sucursal)</label>
                      <select value={sucursalDestinoIdForm} onChange={(e) => setSucursalDestinoIdForm(e.target.value)} className="w-full bg-[#05070f] border border-white/5 text-xs text-slate-200 p-2 rounded-md outline-none">
                        <option value="">Seleccionar</option>
                        {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* TRANSPORTE ASIGNADO */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] uppercase font-mono text-slate-400">Vehículo / Transporte</label>
                    <select value={transporteIdForm} onChange={(e) => setTransporteIdForm(e.target.value)} className="w-full bg-[#05070f] border border-white/5 text-xs text-slate-200 p-2 rounded-md outline-none">
                      <option value="">Seleccionar transporte</option>
                      {transportes.map((t) => <option key={t.id} value={t.id}>{t.placa} · {t.estado}</option>)}
                    </select>
                  </div>

                  {/* NUEVA FILA: TIPO PRODUCTO Y VALOR COMERCIAL */}
                  <div className="flex gap-2">
                    <div className="flex-grow flex-1 flex flex-col gap-1">
                      <label className="text-[9px] uppercase font-mono text-slate-400">Categoría Carga</label>
                      <input type="text" placeholder="Ej: Vacunas, Carnes" value={tipoProductoForm} onChange={(e) => setTipoProductoForm(e.target.value)} className="w-full bg-[#05070f] border border-white/5 text-xs text-slate-200 p-2 rounded-md outline-none" />
                    </div>
                    <div className="flex-grow flex-1 flex flex-col gap-1">
                      <label className="text-[9px] uppercase font-mono text-slate-400">Valor Comercial (USD)</label>
                      <input type="number" placeholder="Monto Asegurado" value={valorComercialForm} onChange={(e) => setValorComercialForm(e.target.value)} className="w-full bg-[#05070f] border border-white/5 text-xs text-slate-200 p-2 rounded-md outline-none" />
                    </div>
                  </div>

                  {/* NUEVA FILA: FICHA DE PESO Y VOLUMEN */}
                  <div className="flex gap-2">
                    <div className="flex-1 flex flex-col gap-1">
                      <label className="text-[9px] uppercase font-mono text-slate-400">Masa Carga (Kg)</label>
                      <input type="number" placeholder="Peso neto" value={pesoKgForm} onChange={(e) => setPesoKgForm(e.target.value)} className="w-full bg-[#05070f] border border-white/5 text-xs text-slate-200 p-2 rounded-md outline-none" />
                    </div>
                    <div className="flex-1 flex flex-col gap-1">
                      <label className="text-[9px] uppercase font-mono text-slate-400">Volumen Carga (m³)</label>
                      <input type="number" step="0.01" placeholder="Cubaje" value={volumenM3Form} onChange={(e) => setVolumenM3Form(e.target.value)} className="w-full bg-[#05070f] border border-white/5 text-xs text-slate-200 p-2 rounded-md outline-none" />
                    </div>
                  </div>

                  {/* FILA: UMBRALES TÉRMICOS SEGUROS */}
                  <div className="flex gap-2">
                    <div className="flex-grow flex-1 flex flex-col gap-1">
                      <label className="text-[9px] uppercase font-mono text-slate-400">Temp Mínima (°C)</label>
                      <input type="number" value={limiteMinTempForm} onChange={(e) => setLimiteMinTempForm(e.target.value)} className="w-full bg-[#05070f] border border-white/5 text-xs text-slate-200 p-2 rounded-md outline-none" />
                    </div>
                    <div className="flex-grow flex-1 flex flex-col gap-1">
                      <label className="text-[9px] uppercase font-mono text-slate-400">Temp Máxima (°C)</label>
                      <input type="number" value={limiteMaxTempForm} onChange={(e) => setLimiteMaxTempForm(e.target.value)} className="w-full bg-[#05070f] border border-white/5 text-xs text-slate-200 p-2 rounded-md outline-none" />
                    </div>
                    <div className="flex-grow flex-1 flex flex-col gap-1">
                      <label className="text-[9px] uppercase font-mono text-slate-400">Estado</label>
                      <select value={estadoForm} onChange={(e) => setEstadoForm(e.target.value as "pendiente" | "en_curso")} className="w-full bg-[#05070f] border border-white/5 text-xs text-slate-200 p-2 rounded-md outline-none">
                        <option value="pendiente">pendiente</option>
                        <option value="en_curso">en_curso</option>
                      </select>
                    </div>
                  </div>

                  {submitError && <div className="text-[11px] text-red-400 font-mono">{submitError}</div>}
                </form>
              </div>

              {/* MAPA DE PREVISUALIZACIÓN */}
              <div className="w-[50%] min-h-[300px] relative border border-white/5 rounded-lg overflow-hidden">
                <RouteMap 
                  waypoints={waypointsFormModal} 
                  routePreviewApiUrl={API_URL} 
                  center={waypointsFormModal[0] ? [waypointsFormModal[0].lat, waypointsFormModal[0].lon] : [13.6929, -89.2182]} 
                  zoom={11} 
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-white/5">
              <button className="text-xs text-slate-400 px-3 py-1.5" onClick={() => { setIsModalOpen(false); resetModalForm(); }}>Cancelar</button>
              <button className="bg-[#0ea5e9] text-white font-bold text-xs px-4 py-1.5 rounded-md hover:opacity-90 transition-all" type="submit" form="new-viaje-form">
                {isSubmitting ? "Procesando..." : "Iniciar Monitoreo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}