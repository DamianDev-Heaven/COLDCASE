"use client";

import { useMemo, useState } from "react";
import { Sparkles, Bot, Shield, CheckCircle, Search, HelpCircle } from "lucide-react";
import ZepAuditModal from "./ZepAuditModal";

interface AiInsightsPanelProps {
  viaje: any;
  telemetryList: any[];
  apiUrl: string;
}

export default function AiInsightsPanel({
  viaje,
  telemetryList,
  apiUrl,
}: AiInsightsPanelProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Encontrar el último diagnóstico de IA en vivo disponible
  const latestLiveDiagnosis = useMemo(() => {
    if (!Array.isArray(telemetryList)) return null;
    const itemsWithIa = telemetryList.filter((t) => t.ia_diagnosis);
    if (itemsWithIa.length === 0) return null;
    // Retornar el último elemento (que corresponde al incidente más reciente)
    return itemsWithIa[itemsWithIa.length - 1];
  }, [telemetryList]);

  if (!viaje) {
    return (
      <div className="h-full flex items-center justify-center bg-[#161920] border border-slate-800 rounded-xl p-6 text-center">
        <p className="text-xs text-slate-500 font-mono">
          Selecciona un envío activo para ver el canal de monitoreo de IA.
        </p>
      </div>
    );
  }

  const isFinalizado = viaje.estado === "finalizado";

  return (
    <div className="h-full flex flex-col bg-[#161920] rounded-xl border border-slate-800 overflow-hidden relative">
      
      {/* GLOW DE DEGRADADO SUTIL PARA MARCAR LA SECCIÓN DE IA */}
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-sky-500 via-indigo-500 to-cyan-500" />

      {/* CABECERA */}
      <header className="px-5 py-4 border-b border-slate-800 flex justify-between items-center bg-[#111319]">
        <div className="flex items-center gap-2">
          {isFinalizado ? (
            <Bot className="w-4 h-4 text-emerald-400" />
          ) : (
            <Sparkles className="w-4 h-4 text-sky-400" />
          )}
          <h2 className="text-xs font-bold text-white uppercase tracking-wider">
            {isFinalizado ? "Auditoría de Calidad" : "Monitoreo Analítico IA"}
          </h2>
        </div>
        <div>
          {isFinalizado ? (
            <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 uppercase tracking-wide">
              Finalizado
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
              <span className="text-[9px] font-bold text-sky-400 uppercase tracking-wide">
                En Vivo
              </span>
            </span>
          )}
        </div>
      </header>

      {/* CONTENIDO PRINCIPAL */}
      <div className="flex-1 p-5 flex flex-col justify-between overflow-y-auto space-y-4">
        
        {/* PARTE SUPERIOR: TEXTOS Y VEREDICTOS */}
        <div className="space-y-4 flex-1">
          {isFinalizado ? (
            // ESTADO FINALIZADO: MOSTRAR AUDITORÍA FINAL PERSISTIDA
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                <CheckCircle className="w-4 h-4 shrink-0" />
                Veredicto Final Persistido
              </div>
              <div className="bg-[#0f1115] border border-slate-800 rounded-lg p-4 text-xs text-slate-300 leading-relaxed font-sans shadow-inner">
                {viaje.auditoria_ia ? (
                  viaje.auditoria_ia
                ) : (
                  <p className="text-slate-500 italic">
                    Generando veredicto de auditoría final... El simulador ha finalizado el viaje pero el LLM está compilando el veredicto definitivo.
                  </p>
                )}
              </div>
            </div>
          ) : (
            // ESTADO EN CURSO: MOSTRAR ÚLTIMO DIAGNÓSTICO EN TIEMPO REAL
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sky-400 text-[10px] font-bold uppercase tracking-wider">
                <Shield className="w-4 h-4 shrink-0" />
                Diagnóstico del Sensor
              </div>
              
              {latestLiveDiagnosis ? (
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-[9px] font-mono text-slate-500 bg-[#0f1115] px-3 py-1 rounded border border-slate-800">
                    <span>
                      Hora Alerta: {new Date(latestLiveDiagnosis.timestamp_sensor).toLocaleTimeString()}
                    </span>
                    <span className="text-red-400 font-bold">
                      Temp: {latestLiveDiagnosis.temp}°C
                    </span>
                  </div>
                  
                  <div className="bg-[#0f1115] border border-slate-800 border-l-2 border-l-sky-500 rounded-lg p-4 text-xs text-slate-300 leading-relaxed font-sans whitespace-pre-wrap">
                    <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                      Análisis de Anomalías (Groq):
                    </div>
                    {latestLiveDiagnosis.ia_diagnosis}
                  </div>
                </div>
              ) : (
                <div className="bg-[#0f1115] border border-slate-800/60 p-5 rounded-lg flex items-center justify-center min-h-[140px] text-center">
                  <div>
                    <span className="text-emerald-400 text-xs font-bold block uppercase tracking-wider">
                      [ Canal Seguro ]
                    </span>
                    <p className="text-[10px] text-slate-500 font-mono mt-2 leading-relaxed max-w-xs">
                      No se han detectado anomalías térmicas ni fallos en la cadena de frío. Estatus operativo estable.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* PARTE INFERIOR: ACCIONES */}
        <div className="pt-4 border-t border-slate-800 shrink-0">
          <button
            onClick={() => setIsModalOpen(true)}
            className="w-full bg-[#111319] hover:bg-slate-900 border border-slate-700 hover:border-slate-500 text-white py-2 px-4 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all shadow"
          >
            <Search className="w-3.5 h-3.5" />
            Explorar Grafo de Memoria (IA)
          </button>
        </div>

      </div>

      {/* EMBEDDED MODAL */}
      <ZepAuditModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        viaje={viaje}
        telemetryList={telemetryList}
        apiUrl={apiUrl}
      />

    </div>
  );
}
