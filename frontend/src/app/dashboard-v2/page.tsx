"use client";

import { useEffect, useMemo, useState } from "react";
import RouteMap from "@/components/RouteMap"; // Tu mapa real basado en OSRM/Leaflet[cite: 1]

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Sucursal = {
  id: string;
  empresa_id: string;
  empresa_nombre: string;
  nombre: string;
  direccion?: string | null;
  lat: number;
  lon: number;
};

export default function DashboardV2() {
  const [viajes, setViajes] = useState<any[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [transportes, setTransportes] = useState<any[]>([]);
  const [viajeSeleccionado, setViajeSeleccionado] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Estados para el formulario real de nuevo envío (Modal)
  const [transporteIdForm, setTransporteIdForm] = useState("");
  const [sucursalOrigenIdForm, setSucursalOrigenIdForm] = useState("");
  const [sucursalDestinoIdForm, setSucursalDestinoIdForm] = useState("");
  const [limiteMaxTempForm, setLimiteMaxTempForm] = useState("5");
  const [estadoForm, setEstadoForm] = useState<"pendiente" | "en_curso" | "pausado" | "cancelado" | "finalizado">("pendiente");

  const resetModalForm = () => {
    setTransporteIdForm("");
    setSucursalOrigenIdForm("");
    setSucursalDestinoIdForm("");
    setLimiteMaxTempForm("5");
    setEstadoForm("pendiente");
    setSubmitError(null);
  };

  const sucursalOrigenSeleccionada = useMemo(
    () => sucursales.find((sucursal) => sucursal.id === sucursalOrigenIdForm) ?? null,
    [sucursales, sucursalOrigenIdForm],
  );

  const sucursalDestinoSeleccionada = useMemo(
    () => sucursales.find((sucursal) => sucursal.id === sucursalDestinoIdForm) ?? null,
    [sucursales, sucursalDestinoIdForm],
  );

  const transporteSeleccionado = useMemo(
    () => transportes.find((transporte) => transporte.id === transporteIdForm) ?? null,
    [transportes, transporteIdForm],
  );

  const isUuid = (value: string) => UUID_REGEX.test(value);

  const selectedWaypoints = useMemo(() => {
    if (!sucursalOrigenSeleccionada || !sucursalDestinoSeleccionada) {
      return [];
    }

    return [
      { lat: Number(sucursalOrigenSeleccionada.lat), lon: Number(sucursalOrigenSeleccionada.lon) },
      { lat: Number(sucursalDestinoSeleccionada.lat), lon: Number(sucursalDestinoSeleccionada.lon) },
    ];
  }, [sucursalOrigenSeleccionada, sucursalDestinoSeleccionada]);

  const isFormReady = Boolean(
    transporteSeleccionado &&
      sucursalOrigenSeleccionada &&
      sucursalDestinoSeleccionada &&
      selectedWaypoints.length === 2 &&
      isUuid(transporteSeleccionado.id) &&
      isUuid(sucursalOrigenSeleccionada.id) &&
      isUuid(sucursalDestinoSeleccionada.id),
  );

  const handleCreateViaje = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);

    if (!transporteIdForm) {
      setSubmitError("Selecciona un transporte.");
      return;
    }

    if (!sucursalOrigenIdForm || !sucursalDestinoIdForm) {
      setSubmitError("Selecciona sucursal de origen y destino.");
      return;
    }

    if (!transporteSeleccionado || !sucursalOrigenSeleccionada || !sucursalDestinoSeleccionada) {
      setSubmitError("La selección actual no coincide con un UUID valido cargado desde la base de datos.");
      return;
    }

    if (
      !isUuid(transporteSeleccionado.id) ||
      !isUuid(sucursalOrigenSeleccionada.id) ||
      !isUuid(sucursalDestinoSeleccionada.id)
    ) {
      setSubmitError("Los identificadores seleccionados no son UUID validos.");
      return;
    }

    const payload = {
      transporte_id: transporteSeleccionado.id,
      limite_max_temp: Number(limiteMaxTempForm),
      sucursal_origen_id: sucursalOrigenSeleccionada.id,
      sucursal_destino_id: sucursalDestinoSeleccionada.id,
      estado: estadoForm,
    };

    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_URL}/viaje`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "No se pudo crear el viaje");
      }

      const nuevoViaje = await response.json();
      setViajes((current) => [nuevoViaje, ...current]);
      setViajeSeleccionado(nuevoViaje);
      setIsModalOpen(false);
      resetModalForm();
    } catch (error) {
      console.error("Error creando envío:", error);
      setSubmitError(error instanceof Error ? error.message : "Error inesperado al crear el envío");
    } finally {
      setIsSubmitting(false);
    }
  };

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
        console.error("Error cargando viajes reales:", error);
      } finally {
        setIsLoading(false);
      }
    }
    cargarViajes();
    const interval = setInterval(cargarViajes, 5000);
    return () => clearInterval(interval);
  }, [viajeSeleccionado]);

  const [activeTab, setActiveTab] = useState<"overview" | "timeline" | "documents" | "incidents">("overview");
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="h-screen w-full bg-[#0f1115] flex items-center justify-center text-white font-mono">
        Cargando telemetría de COLDCASE...
      </div>
    );
  }

  return (
    <div className="bg-app-main text-app-primary h-screen w-full overflow-hidden flex flex-col font-sans antialiased">
      
      {/* HEADER BAR */}
      <header className="bg-surface fixed top-0 right-0 w-[calc(100%-64px)] z-30 border-b border-outline-variant flex justify-between items-center px-6 h-16 transition-colors">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-on-surface">Tracking Dashboard</h1>
          <div className="h-6 w-px bg-outline-variant mx-2"></div>
          <div className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-wider text-slate-400">
            <div className="flex items-center gap-1.5">
              <div className="w-[6px] h-[6px] rounded-full bg-[#22c55e] animate-pulse"></div>
              <span>Back: Online</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-[6px] h-[6px] rounded-full bg-[#22c55e] animate-pulse"></div>
              <span>DB: Persistent</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-[6px] h-[6px] rounded-full bg-[#22c55e] animate-pulse"></div>
              <span>SIM: Online</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => {
              resetModalForm();
              setIsModalOpen(true);
            }}
            className="bg-primary-container text-on-primary-container hover:opacity-90 px-4 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            Registrar Envío
          </button>
        </div>
      </header>

      {/* WORKSPACE */}
      <div className="flex h-full pt-16">
        
        {/* SIDE NAV */}
        <nav className="bg-surface-container-low fixed left-0 top-0 h-full w-[64px] z-30 border-r border-outline-variant flex flex-col items-center py-4 justify-between">
          <div className="w-10 h-10 bg-primary-container rounded-lg flex items-center justify-center mb-8">
            <span className="font-bold text-on-primary-container">CC</span>
          </div>
        </nav>

        {/* MAIN LAYOUT */}
        <main className="flex-1 ml-[64px] flex w-full h-full bg-app-main p-3 gap-3 overflow-hidden">
          
          {/* BARRA LATERAL: LISTA DE VIAJES */}
          <aside className="w-[380px] h-full flex flex-col bg-app-main rounded-lg overflow-hidden border-app-border border">
            <div className="p-4 border-b border-app-border shrink-0">
              <h2 className="text-md font-bold text-app-primary flex items-center gap-2">
                Lista de Monitoreo
                <span className="bg-surface-container-highest text-app-secondary px-2 py-0.5 rounded-full text-[10px]">
                  {viajes.length} activos
                </span>
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {viajes.map((viaje) => {
                let primerPunto = "No asignado";
                let ultimoPunto = "No asignado";

                try {
                  const datosRuta = viaje.ruta_waypoints || viaje.rutaWaypoints;
                  if (datosRuta) {
                    const waypoints = typeof datosRuta === "string" ? JSON.parse(datosRuta) : datosRuta;
                    const feature = Array.isArray(waypoints) ? null : waypoints?.features?.[0];

                    if (Array.isArray(waypoints) && waypoints.length > 0) {
                      primerPunto = waypoints[0].name || waypoints[0].nombre || "Inicio";
                      ultimoPunto = waypoints[waypoints.length - 1].name || waypoints[waypoints.length - 1].nombre || "Fin";
                    } else if (feature) {
                      const propiedades = feature.properties ?? {};
                      const coordenadas = feature.geometry?.coordinates ?? [];

                      primerPunto =
                        propiedades.origen_sucursal_nombre ||
                        propiedades.origen ||
                        propiedades.ruta_origen ||
                        "Inicio";
                      ultimoPunto =
                        propiedades.destino_sucursal_nombre ||
                        propiedades.destino ||
                        "Fin";

                      if (primerPunto === "Inicio" && Array.isArray(coordenadas) && coordenadas.length > 0) {
                        const [lon, lat] = coordenadas[0];
                        primerPunto = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
                      }

                      if (ultimoPunto === "Fin" && Array.isArray(coordenadas) && coordenadas.length > 0) {
                        const [lon, lat] = coordenadas[coordenadas.length - 1];
                        ultimoPunto = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
                      }
                    }
                  }
                } catch (err) {
                  console.error("Error al procesar los waypoints del viaje:", err);
                }

                return (
                  <div 
                    key={viaje.id}
                    onClick={() => setViajeSeleccionado(viaje)}
                    className={`bg-app-panel border rounded-lg p-4 cursor-pointer hover:border-app-secondary transition-all relative overflow-hidden group ${
                      viajeSeleccionado?.id === viaje.id ? 'border-app-accent' : 'border-app-border'
                    }`}
                  >
                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${viajeSeleccionado?.id === viaje.id ? 'bg-app-accent' : 'transparent'}`}></div>
                    
                    <div className="flex justify-between items-start mb-3">
                      <span className="font-mono text-app-primary text-sm font-semibold">
                        Envío #{viaje.id.substring(0, 6).toUpperCase()}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        viaje.estado === 'en_curso' ? 'bg-[#1e293b] text-app-accent border border-app-accent/30' : 
                        viaje.estado === 'pendiente' ? 'bg-slate-800 text-slate-400' : 'bg-emerald-950 text-emerald-400'
                      }`}>
                        {viaje.estado}
                      </span>
                    </div>

                    <div className="font-mono text-[10px] text-slate-500 mb-2">
                      UMBRAL: {viaje.limite_max_temp || viaje.limiteMaxTemp || 2.0}°C
                    </div>

                    <div className="mt-4 flex flex-col gap-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-app-secondary">Origen:</span>
                        <span className="text-app-primary font-medium">{primerPunto}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-app-secondary">Destino:</span>
                        <span className="text-app-primary font-medium">{ultimoPunto}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>

          {/* VISUALIZADOR PRINCIPAL */}
          <div className="flex-1 flex flex-col gap-3 h-full min-w-0">
            
            {/* MAPA DEL DASHBOARD (z-10 para evitar que flote sobre el modal) */}
            <div className="flex-1 bg-app-map rounded-xl border border-app-border relative overflow-hidden flex flex-col z-10">
              {viajeSeleccionado ? (
                <RouteMap 
                  viajeId={viajeSeleccionado.id} 
                  waypoints={selectedWaypoints}
                  routePreviewApiUrl={API_URL}
                />
              ) : (
                <div className="m-auto text-app-secondary text-sm">Selecciona un envío para ver el mapa</div>
              )}
            </div>

            {/* LOWER SPECS TABS */}
            <div className="h-[280px] shrink-0 bg-app-panel rounded-xl border border-app-border flex flex-col overflow-hidden relative">
              <div className="flex border-b border-app-border px-4 pt-2">
                <button 
                  onClick={() => setActiveTab("overview")}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "overview" ? "border-app-accent text-app-primary" : "border-transparent text-app-secondary"}`}
                >Overview</button>
                <button 
                  onClick={() => setActiveTab("timeline")}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "timeline" ? "border-app-accent text-app-primary" : "border-transparent text-app-secondary"}`}
                >Timeline</button>
              </div>

              <div className="flex-1 p-6 bg-app-panel relative overflow-y-auto">
                {activeTab === "overview" && viajeSeleccionado && (
                  <div className="flex gap-8 items-center h-full">
                    <div className="flex flex-col w-1/4">
                      <h3 className="text-lg text-app-primary font-bold">ID: {viajeSeleccionado.id.substring(0,8)}</h3>
                      <p className="text-xs text-app-secondary">Estado: {viajeSeleccionado.estado}</p>
                    </div>
                    <div className="flex-1 bg-[#1b2023] p-4 rounded-lg border border-app-border">
                      <span className="text-[10px] uppercase text-app-secondary">Última Temperatura Registrada</span>
                      <h2 className="text-2xl font-bold text-app-primary">
                        {viajeSeleccionado.limite_max_temp} °C
                      </h2>
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>
        </main>
      </div>

      {/* ========================================================
          MODAL DE REGISTRO ROBUSTO (Con z-50 para quedar arriba del todo)
         ======================================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#161920] border border-slate-800/80 w-[850px] p-6 rounded-xl shadow-2xl relative">
            
            <button 
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors z-[60]" 
              onClick={() => {
                setIsModalOpen(false);
                resetModalForm();
              }}
            >
              <span className="material-symbols-outlined">close</span>
            </button>
            
            <div className="mb-6">
              <h2 className="text-base font-semibold text-slate-100 mb-1">Registrar Nuevo Envío</h2>
              <p className="text-xs text-slate-400">Asigne la empresa, transporte y dibuje los hitos directamente sobre el mapa de control</p>
            </div>

            <div className="flex flex-row gap-8">
              {/* COLUMNA IZQUIERDA: FORMULARIO */}
              <div className="w-[45%] flex flex-col gap-4">
                <form id="new-viaje-form" className="flex flex-col gap-4" onSubmit={handleCreateViaje}>
                  {/* DROPBOX DE TRANSPORTE */}
                  <div className="flex flex-col gap-1.5">
                    <label className="uppercase text-[10px] text-slate-400 font-mono font-semibold">Transporte</label>
                    <select 
                      value={transporteIdForm}
                      onChange={(e) => setTransporteIdForm(e.target.value)}
                      className="w-full bg-[#0f1115] border border-slate-800 text-xs text-slate-200 p-2.5 rounded-md focus:border-[#4cc9f0] outline-none"
                    >
                      <option value="">Seleccionar transporte</option>
                      {transportes.map((transporte) => (
                        <option key={transporte.id} value={transporte.id}>
                          {transporte.placa} · {transporte.estado}
                        </option>
                      ))}
                    </select>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {transporteSeleccionado ? transporteSeleccionado.id : "Selecciona un transporte para obtener su UUID"}
                    </span>
                  </div>

                  <div className="flex gap-4">
                    <div className="flex flex-col gap-1.5 flex-1">
                      <label className="uppercase text-[10px] text-slate-400 font-mono font-semibold">Sucursal origen</label>
                      <select
                        value={sucursalOrigenIdForm}
                        onChange={(e) => setSucursalOrigenIdForm(e.target.value)}
                        className="w-full bg-[#0f1115] border border-slate-800 text-xs text-slate-200 p-2.5 rounded-md focus:border-[#4cc9f0] outline-none"
                      >
                        <option value="">Selecciona sucursal de origen</option>
                        {sucursales.map((sucursal) => (
                          <option key={sucursal.id} value={sucursal.id}>
                            {sucursal.empresa_nombre} · {sucursal.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5 flex-1">
                      <label className="uppercase text-[10px] text-slate-400 font-mono font-semibold">Sucursal destino</label>
                      <select
                        value={sucursalDestinoIdForm}
                        onChange={(e) => setSucursalDestinoIdForm(e.target.value)}
                        className="w-full bg-[#0f1115] border border-slate-800 text-xs text-slate-200 p-2.5 rounded-md focus:border-[#4cc9f0] outline-none"
                      >
                        <option value="">Selecciona sucursal de destino</option>
                        {sucursales.map((sucursal) => (
                          <option key={sucursal.id} value={sucursal.id}>
                            {sucursal.empresa_nombre} · {sucursal.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="flex flex-col gap-1.5 flex-1">
                      <label className="uppercase text-[10px] text-slate-400 font-mono font-semibold">Temperatura máxima</label>
                      <input
                        type="number"
                        step="0.1"
                        value={limiteMaxTempForm}
                        onChange={(e) => setLimiteMaxTempForm(e.target.value)}
                        className="w-full bg-[#0f1115] border border-slate-800 text-xs text-slate-200 p-2.5 rounded-md focus:border-[#4cc9f0] outline-none"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5 flex-1">
                      <label className="uppercase text-[10px] text-slate-400 font-mono font-semibold">Estado inicial</label>
                      <select
                        value={estadoForm}
                        onChange={(e) => setEstadoForm(e.target.value as typeof estadoForm)}
                        className="w-full bg-[#0f1115] border border-slate-800 text-xs text-slate-200 p-2.5 rounded-md focus:border-[#4cc9f0] outline-none"
                      >
                        <option value="pendiente">pendiente</option>
                        <option value="en_curso">en_curso</option>
                        <option value="pausado">pausado</option>
                        <option value="cancelado">cancelado</option>
                        <option value="finalizado">finalizado</option>
                      </select>
                    </div>
                  </div>

                  {submitError && (
                    <div className="rounded-md border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs text-red-200">
                      {submitError}
                    </div>
                  )}
                </form>
              </div>

              {/* COLUMNA DERECHA: MAPA SELECCIONABLE E INTERACTIVO (COMO SETUP) */}
              <div className="w-[55%] flex flex-col">
                <div className="flex-1 bg-app-map border border-slate-800 rounded-lg relative overflow-hidden min-h-[320px] flex flex-col">
                  
                  {/* Cargamos tu componente RouteMap real para interactuar de forma nativa */}
                  <RouteMap 
                    waypoints={selectedWaypoints}
                    routePreviewApiUrl={API_URL}
                    center={selectedWaypoints[0] ? [selectedWaypoints[0].lat, selectedWaypoints[0].lon] : [13.6929, -89.2182]}
                    zoom={selectedWaypoints.length > 0 ? 13 : 12}
                  />

                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-md p-3 border-t border-slate-800 z-50 flex justify-between items-center">
                    <p className="text-[10px] font-mono text-slate-300">
                      Ruta en mapa: <span className="text-white">{sucursalOrigenSeleccionada ? `${sucursalOrigenSeleccionada.empresa_nombre} · ${sucursalOrigenSeleccionada.nombre}` : "Origen"} → {sucursalDestinoSeleccionada ? `${sucursalDestinoSeleccionada.empresa_nombre} · ${sucursalDestinoSeleccionada.nombre}` : "Destino"}</span>
                    </p>
                    <p className="text-[10px] font-mono text-slate-300">
                      {selectedWaypoints.length === 2 ? "OSRM listo sobre sucursales seleccionadas" : "Selecciona ambas sucursales"}
                    </p>
                  </div>
                </div>
              </div>

            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-800/80">
              <button 
                className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors" 
                onClick={() => {
                  setIsModalOpen(false);
                  resetModalForm();
                }}
                type="button"
              >
                Cancelar
              </button>
              <button 
                className="px-6 py-2 bg-[#4cc9f0] text-black text-xs font-bold rounded-md hover:bg-[#3db8df] transition-colors" 
                type="submit"
                form="new-viaje-form"
              >
                {isSubmitting ? "Creando..." : "Iniciar Monitoreo"}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}