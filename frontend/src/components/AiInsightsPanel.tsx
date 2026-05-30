"use client";

import { useMemo, useState } from "react";
import { Sparkles, Bot, Shield, CheckCircle, Search } from "lucide-react";
import ZepAuditModal from "./ZepAuditModal";

interface ZepAuditViaje {
  id: string;
  estado?: string;
  auditoria_ia?: string | null;
  tipo_producto?: string;
}

interface TelemetryPoint {
  timestamp_sensor: string;
  temp: number;
  ia_diagnosis?: string | null;
}

interface SimulatorState {
  iotFailure: boolean;
  paused: boolean;
  turboMode: boolean;
  lastError?: string | null;
  iotFailureSince?: string | null;
  lastSignalEvent?: {
    type: string;
    message?: string;
    viajeId?: string;
    bufferLength?: number;
    createdAt?: string;
  } | null;
  trip?: {
    offlineBufferLength?: number;
    status?: string;
  } | null;
}

interface AiInsightsPanelProps {
  viaje: ZepAuditViaje | null;
  telemetryList: TelemetryPoint[];
  apiUrl: string;
  simulatorState?: SimulatorState | null;
  onOpenZepModal?: () => void;
}

export default function AiInsightsPanel({
  viaje,
  telemetryList,
  apiUrl,
  simulatorState,
  onOpenZepModal,
}: AiInsightsPanelProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const simulatorDiagnosisText =
    simulatorState?.lastSignalEvent?.message || simulatorState?.lastError || null;
  const hasSimulatorDiagnosis = Boolean(
    simulatorState?.iotFailure || simulatorDiagnosisText,
  );

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
      <div className="h-full flex items-center justify-center bg-black border border-white/10 rounded-xl p-6 text-center transition-all duration-300">
        <p className="text-xs text-slate-500 font-mono">
          Selecciona un envío para ver el canal de monitoreo de IA.
        </p>
      </div>
    );
  }

  const isFinalizado = viaje.estado === "finalizado";

  return (
    <div className="h-full flex flex-col bg-black rounded-xl border border-white/10 overflow-hidden relative transition-all duration-300">
      
      <div className="absolute top-0 left-0 w-full h-[1px] bg-white/12" />

      {/* CABECERA */}
      <header className="px-5 py-4 border-b border-white/8 flex justify-between items-center bg-black">
        <div className="flex items-center gap-2">
          {isFinalizado ? (
            <Bot className="w-4 h-4 text-white/80" />
          ) : (
            <Sparkles className="w-4 h-4 text-white/80 animate-pulse" />
          )}
          <h2 className="text-xs font-bold text-white uppercase tracking-wider">
            {isFinalizado ? "Auditoría de Calidad" : "Monitoreo Analítico IA"}
          </h2>
        </div>
        <div>
          {isFinalizado ? (
            <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-black text-white/70 border border-white/10 uppercase tracking-wide">
              Finalizado
            </span>
          ) : (
            <span className="flex items-center gap-1.5 bg-black border border-white/10 px-2 py-0.5 rounded">
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white"></span>
              </span>
              <span className="text-[9px] font-bold text-white uppercase tracking-wide">
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
              <div className="flex items-center gap-2 text-white text-[10px] font-bold uppercase tracking-wider">
                <CheckCircle className="w-4 h-4 shrink-0 animate-bounce" />
                Veredicto Final Persistido
              </div>
              <div className="bg-[#050505] border border-white/8 rounded-lg p-4 text-xs text-slate-300 leading-relaxed font-sans">
                {viaje.auditoria_ia ? (
                  viaje.auditoria_ia
                ) : (
                  <p className="text-slate-500 italic animate-pulse">
                    Generando veredicto de auditoría final... El simulador ha finalizado el viaje pero el LLM está compilando el veredicto definitivo.
                  </p>
                )}
              </div>
            </div>
          ) : (
            // ESTADO EN CURSO: MOSTRAR ÚLTIMO DIAGNÓSTICO EN TIEMPO REAL
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-white text-[10px] font-bold uppercase tracking-wider">
                <Shield className="w-4 h-4 shrink-0" />
                Diagnóstico del Sensor
              </div>
              
              {latestLiveDiagnosis ? (
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-[9px] font-mono text-slate-400 bg-black px-3 py-1.5 rounded border border-white/8">
                    <span>
                      Hora Alerta: {new Date(latestLiveDiagnosis.timestamp_sensor).toLocaleTimeString()}
                    </span>
                    <span className="text-white font-bold flex items-center gap-1">
                      <span className="relative flex h-1.5 w-1.5 shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white"></span>
                      </span>
                      Temp: {latestLiveDiagnosis.temp}°C
                    </span>
                  </div>
                  
                  <div className="bg-[#050505] border border-white/8 rounded-lg p-4 text-xs text-slate-300 leading-relaxed font-sans whitespace-pre-wrap">
                    <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                      Análisis de Anomalías (Groq):
                    </div>
                    {latestLiveDiagnosis.ia_diagnosis}
                  </div>

                  {hasSimulatorDiagnosis && (
                    <div className="bg-rose-950/25 border border-rose-500/30 p-4 rounded-lg text-left">
                      <div className="text-[9px] font-bold text-rose-300 uppercase tracking-wider mb-1">
                        Diagnóstico de Resiliencia IoT
                      </div>
                      <p className="text-[11px] text-rose-100 leading-relaxed">
                        {simulatorDiagnosisText || "Pérdida de señal IoT activa"}
                      </p>
                      <p className="text-[10px] text-rose-200/80 font-mono mt-2">
                        Buffer local: {simulatorState?.trip?.offlineBufferLength ?? 0} · Estado: {simulatorState?.trip?.status || "-"}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {hasSimulatorDiagnosis && (
                    <div className="bg-rose-950/25 border border-rose-500/30 p-4 rounded-lg text-left">
                      <div className="text-[9px] font-bold text-rose-300 uppercase tracking-wider mb-1">
                        Diagnóstico de Resiliencia IoT
                      </div>
                      <p className="text-[11px] text-rose-100 leading-relaxed">
                        {simulatorDiagnosisText || "Pérdida de señal IoT activa"}
                      </p>
                      <p className="text-[10px] text-rose-200/80 font-mono mt-2">
                        Buffer local: {simulatorState?.trip?.offlineBufferLength ?? 0} · Estado: {simulatorState?.trip?.status || "-"}
                      </p>
                    </div>
                  )}

                  {!hasSimulatorDiagnosis && (
                    <div className="bg-[#050505] border border-white/8 p-5 rounded-lg flex items-center justify-center min-h-[140px] text-center">
                      <div>
                        <span className="text-white text-xs font-bold flex items-center justify-center gap-1.5 uppercase tracking-wider">
                          <span className="relative flex h-1.5 w-1.5 shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60"></span>
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white"></span>
                          </span>
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
          )}
        </div>

        {/* PARTE INFERIOR: ACCIONES */}
        <div className="pt-4 border-t border-white/8 shrink-0">
          <button
            onClick={onOpenZepModal || (() => setIsModalOpen(true))}
            className="w-full bg-black hover:bg-white/6 border border-white/10 hover:border-white/20 text-white py-2 px-4 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all duration-300 cursor-pointer"
          >
            <Search className="w-3.5 h-3.5" />
            Explorar Grafo de Memoria (IA)
          </button>
        </div>

      </div>

      {/* EMBEDDED MODAL */}
      <ZepAuditModal
        isOpen={onOpenZepModal ? false : isModalOpen}
        onClose={() => setIsModalOpen(false)}
        viaje={viaje}
        telemetryList={telemetryList}
        apiUrl={apiUrl}
      />

    </div>
  );
}
