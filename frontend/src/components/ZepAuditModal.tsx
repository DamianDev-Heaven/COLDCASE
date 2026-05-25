"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Database, Network, Clock, AlertTriangle } from "lucide-react";

interface ZepAuditViaje {
  id: string;
  tipo_producto?: string;
}

interface ZepTelemetryItem {
  id?: string | number;
  ia_diagnosis?: string | null;
  timestamp_sensor: string;
  temp?: number;
  humedad?: number | null;
  bateria?: number | null;
}

interface ZepAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  viaje: ZepAuditViaje | null;
  telemetryList: ZepTelemetryItem[];
  apiUrl: string;
}

export default function ZepAuditModal({
  isOpen,
  onClose,
  viaje,
  telemetryList,
  apiUrl,
}: ZepAuditModalProps) {
  const [zepFacts, setZepFacts] = useState<string[]>([]);
  const [isLoadingZep, setIsLoadingZep] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen || !viaje?.id) return;
    const viajeId = viaje.id;

    async function fetchZepContext() {
      setIsLoadingZep(true);
      try {
        // Incluir el viaje_id en la query para que Zep devuelva hechos
        // relevantes exclusivamente para este trayecto.
        const queryFiltrada = encodeURIComponent(
          `anomalias termicas y alertas operativas del viaje ${viajeId}`
        );
        const res = await fetch(
          `${apiUrl}/ia/contexto-grafo/${viajeId}?query=${queryFiltrada}`
        );
        if (res.ok) {
          const data = await res.json();
          // El backend devuelve { messages: "..." } donde las relaciones se separan por saltos de línea
          if (data && typeof data.messages === "string") {
            const lines = data.messages
              .split("\n")
              .map((line: string) => line.replace(/^-\s*\[Conocimiento Previo\]:\s*/i, "").trim())
              .filter((line: string) => line.length > 0);
            setZepFacts(lines);
          } else {
            setZepFacts([]);
          }
        }
      } catch (error) {
        console.error("Error al cargar hechos semánticos de Zep:", error);
        setZepFacts([]);
      } finally {
        setIsLoadingZep(false);
      }
    }

    fetchZepContext();
  }, [isOpen, viaje?.id, apiUrl]);

  if (!isOpen || !viaje) return null;

  // Anomalías del viaje actual ordenadas de más reciente a más antigua
  const aiIncidentList = telemetryList
    .filter((t) => t.ia_diagnosis)
    .sort(
      (a, b) =>
        new Date(b.timestamp_sensor).getTime() -
        new Date(a.timestamp_sensor).getTime()
    );

  const modalMarkup = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#111319] border border-slate-800 rounded-xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden shadow-2xl">
        
        {/* HEADER */}
        <header className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-[#161920]">
          <div>
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-sky-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Auditoría Semántica de Calidad
              </h2>
            </div>
            <p className="text-[10px] text-slate-400 font-mono mt-0.5">
              ID Viaje: {viaje.id.toUpperCase()} · Producto: {viaje.tipo_producto || "No especificado"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* WORKSPACE */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0 bg-[#0f1115]">
          
          {/* COLUMNA IZQUIERDA: TIMELINE DE DIAGNÓSTICOS IA */}
          <section className="flex-1 border-b md:border-b-0 md:border-r border-slate-800 p-5 md:p-6 flex flex-col min-h-0 overflow-hidden">
            <div className="flex items-center gap-2 mb-4 shrink-0">
              <Clock className="w-4 h-4 text-sky-400" />
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Línea de Tiempo Operativa (Anomalías)
              </h3>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              {aiIncidentList.length === 0 ? (
                <div className="h-full flex items-center justify-center border border-dashed border-slate-800/80 rounded-lg p-8">
                  <div className="text-center max-w-sm">
                    <span className="text-xs text-emerald-400 font-bold block uppercase tracking-wider">
                      [ Canal Seguro · Estatus Estable ]
                    </span>
                    <p className="text-[10px] text-slate-500 font-mono mt-2 leading-relaxed">
                      La cadena de frío no registró alertas térmicas ni incidentes de geolocalización durante el trayecto.
                    </p>
                  </div>
                </div>
              ) : (
                aiIncidentList.map((diag, index) => {
                  const formattedTime = new Date(diag.timestamp_sensor).toLocaleString();
                  return (
                    <div
                      key={diag.id || index}
                      className="bg-slate-950 border border-slate-800/80 rounded-lg p-4 flex flex-col gap-3"
                    >
                      <div className="flex justify-between items-center text-[10px] font-mono border-b border-slate-800 pb-2">
                        <span className="text-red-500 font-bold flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          ANOMALÍA DETECTADA
                        </span>
                        <span className="text-slate-500">{formattedTime}</span>
                      </div>
                      
                      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch sm:items-start">
                        <div className="text-[10px] font-mono bg-[#111319] border border-slate-800 p-3 rounded shrink-0 flex flex-col gap-1 text-slate-400">
                          <div>
                            Métrica: <span className="text-red-400 font-bold">{diag.temp}°C</span>
                          </div>
                          <div>
                            Humedad: <span className="text-slate-300">{diag.humedad}%</span>
                          </div>
                          <div>
                            Batería: <span className="text-slate-300">{diag.bateria}%</span>
                          </div>
                        </div>

                        <div className="flex-1 bg-[#111319] border-l-2 border-slate-600 rounded p-3 text-xs text-slate-300 font-sans leading-relaxed">
                          <div className="text-[9px] font-bold text-slate-500 tracking-wide uppercase mb-1">
                            Diagnóstico Técnico de IA:
                          </div>
                          <p className="whitespace-pre-wrap">{diag.ia_diagnosis}</p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* COLUMNA DERECHA: GRAFO SEMÁNTICO ZEP */}
          <section className="w-full md:w-[380px] h-[35vh] md:h-full p-5 md:p-6 flex flex-col bg-[#111319] shrink-0 min-h-0 overflow-hidden">
            <div className="flex items-center gap-2 mb-4 shrink-0">
              <Network className="w-4 h-4 text-sky-400" />
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Grafo de Conocimiento (Zep Memory)
              </h3>
            </div>

            <div className="flex-1 overflow-y-auto pr-1">
              {isLoadingZep ? (
                <div className="h-full flex items-center justify-center text-[10px] font-mono text-slate-500">
                  Sincronizando Grafo de Zep Cloud...
                </div>
              ) : zepFacts.length === 0 ? (
                <div className="h-full flex items-center justify-center border border-dashed border-slate-800/80 rounded-lg p-6 text-center">
                  <div className="max-w-xs">
                    <span className="text-[10px] text-slate-500 font-mono block">
                      Grafo sin hechos acumulados.
                    </span>
                    <p className="text-[9px] text-slate-600 font-mono mt-1 leading-relaxed">
                      Zep consolida hechos relacionales del viaje cuando ocurren incidentes y llamadas repetidas al LLM.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {zepFacts.map((fact, index) => (
                    <div
                      key={index}
                      className="bg-slate-950 border border-slate-800 border-l-2 border-l-sky-500 rounded-lg p-3 text-[11px] text-slate-300 font-mono leading-relaxed"
                    >
                      <div className="text-[8px] font-bold text-sky-400 uppercase tracking-wider mb-1">
                        Hecho Relacional #{index + 1}
                      </div>
                      {fact}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

        </div>

        {/* FOOTER */}
        <footer className="px-6 py-3 border-t border-slate-800 flex justify-end items-center bg-[#161920]">
          <button
            onClick={onClose}
            className="bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 px-4 py-1.5 rounded-md text-xs font-bold transition-all"
          >
            Cerrar Auditoría
          </button>
        </footer>

      </div>
    </div>
  );

  return mounted ? createPortal(modalMarkup, document.body) : null;
}

