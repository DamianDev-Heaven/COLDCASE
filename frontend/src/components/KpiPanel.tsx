import React from 'react';

// Interfaces alineadas a tu init.sql
interface Viaje {
  id: string;
  estado: 'pendiente' | 'en_curso' | 'pausado' | 'cancelado' | 'finalizado';
  valor_comercial: number;
  peso_kg: number;
  volumen_m3: number;
  transporte_id: string;
  capacidad_max_transporte?: number; // Mapeado desde la tabla transporte
}

interface Incidente {
  viaje_id: string;
  resuelta: boolean;
}

interface KpiPanelProps {
  viajes: Viaje[];
  incidentes: Incidente[];
}

export const KpiPanel: React.FC<KpiPanelProps> = ({ viajes, incidentes }) => {
  // 1. Exposición Financiera Total (Viajes 'en_curso')
  const exposicionTotal = viajes
    .filter((v) => v.estado === 'en_curso')
    .reduce((sum, v) => sum + Number(v.valor_comercial || 0), 0);

  // 2. Capital en Riesgo (Viajes en curso con incidentes ACTIVOS/no resueltos)
  const capitalEnRiesgo = viajes
    .filter((v) => {
      const tieneIncidenteActivo = incidentes.some(
        (i) => i.viaje_id === v.id && !i.resuelta
      );
      return v.estado === 'en_curso' && tieneIncidenteActivo;
    })
    .reduce((sum, v) => sum + Number(v.valor_comercial || 0), 0);

  // 3. Eficiencia Volumétrica (Simulado en base a peso ocupado vs capacidad del camión)
  // Asumiendo una capacidad promedio de tara de camión de 15,000kg si no viene definida
  const eficienciaPromedio = viajes.filter((v) => v.estado === 'en_curso').length
    ? viajes
        .filter((v) => v.estado === 'en_curso')
        .reduce((acc, v) => {
          const maxCapacidad = v.capacidad_max_transporte || 15000; 
          return acc + (v.peso_kg / maxCapacidad) * 100;
        }, 0) / viajes.filter((v) => v.estado === 'en_curso').length
    : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
      {/* Tarjeta 1: Exposición Financiera */}
      <div className="bg-black border border-white/8 p-5 rounded-xl shadow-none">
        <p className="text-sm font-medium text-slate-400 uppercase tracking-wider">
          Exposición Financiera Total
        </p>
        <p className="text-2xl font-bold text-white mt-2">
          ${exposicionTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </p>
        <span className="text-xs text-white/60 font-medium block mt-1">
          Carga activa en tránsito
        </span>
      </div>

      {/* Tarjeta 2: Capital en Riesgo */}
      <div className={`border p-5 rounded-xl shadow-none transition-all ${
        capitalEnRiesgo > 0 
          ? 'bg-black border-white/12' 
          : 'bg-black border-white/8'
      }`}>
        <p className="text-sm font-medium text-slate-400 uppercase tracking-wider">
          Capital Crítico en Riesgo
        </p>
        <p className={`text-2xl font-bold mt-2 ${capitalEnRiesgo > 0 ? 'text-white' : 'text-white'}`}>
          ${capitalEnRiesgo.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </p>
        <span className="text-xs font-medium block mt-1 text-white/60">
          {capitalEnRiesgo > 0 ? 'Requiere mitigación inmediata' : 'Sin alertas críticas'}
        </span>
      </div>

      {/* Tarjeta 3: Eficiencia Volumétrica */}
      <div className="bg-black border border-white/8 p-5 rounded-xl shadow-none">
        <p className="text-sm font-medium text-slate-400 uppercase tracking-wider">
          Eficiencia de Capacidad Ocupada
        </p>
        <p className="text-2xl font-bold text-white mt-2">
          {eficienciaPromedio.toFixed(1)}%
        </p>
        <div className="w-full bg-white/6 h-2 rounded-full mt-3 overflow-hidden">
          <div 
            className="bg-white/30 h-full rounded-full transition-all duration-500" 
            style={{ width: `${Math.min(eficienciaPromedio, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
};