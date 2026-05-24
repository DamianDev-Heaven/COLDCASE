'use client';

import React from 'react';
import { ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, Tooltip, ReferenceArea } from 'recharts';

interface PuntoTelemetria {
  timestamp_sensor: string;
  temp: number;
}

interface TelemetryChartProps {
  data: PuntoTelemetria[];
  limiteMin: number;
  limiteMax: number;
}

export const TelemetryChart: React.FC<TelemetryChartProps> = ({ data, limiteMin, limiteMax }) => {
  
  // Componente personalizado para renderizar los nodos del gráfico (Detección de Infracciones)
  const CustomDot = (props: any) => {
    const { cx, cy, payload } = props;
    const temperatura = payload.temp;

    const esAlta = temperatura > limiteMax;
    const esBaja = temperatura < limiteMin;

    if (esAlta || esBaja) {
      const colorClase = esAlta ? 'fill-red-500' : 'fill-sky-400';
      const pingClase = esAlta ? 'bg-red-500' : 'bg-sky-400';

      return (
        <g key={`dot-${payload.timestamp_sensor}`}>
          {/* Efecto de pulso / Parpadeo usando la animación nativa de Tailwind */}
          <foreignObject x={cx - 10} y={cy - 10} width={20} height={20}>
            <div className={`w-full h-full rounded-full opacity-75 animate-ping ${pingClase}`} />
          </foreignObject>
          {/* Nodo sólido central */}
          <circle cx={cx} cy={cy} r={5} className={`${colorClase} stroke-slate-950 stroke-2`} />
        </g>
      );
    }

    // Nodo normal si está dentro de la zona segura
    return <circle cx={cx} cy={cy} r={3} className="fill-slate-400 stroke-slate-900" key={`dot-normal-${payload.timestamp_sensor}`} />;
  };

  return (
    <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-lg w-full h-[350px]">
      <h3 className="text-white text-base font-semibold mb-4 flex items-center gap-2">
        📈 Monitoreo Térmico en Tiempo Real 
        <span className="text-xs font-normal text-slate-400">(Zona Segura: {limiteMin}°C a {limiteMax}°C)</span>
      </h3>
      
      <ResponsiveContainer width="100%" height="90%">
        <ComposedChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <XAxis 
            dataKey="timestamp_sensor" 
            tickFormatter={(tick) => new Date(tick).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            stroke="#64748b"
            fontSize={12}
          />
          <YAxis stroke="#64748b" fontSize={12} domain={[limiteMin - 5, limiteMax + 5]} />
          <Tooltip 
            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#fff' }}
            labelFormatter={(label) => new Date(label).toLocaleString()}
          />
          
          {/* ============================================ */}
          {/* RANGO TÉRMICO SOMBREADO: LA ZONA SEGURA      */}
          {/* ============================================ */}
          <ReferenceArea 
            y1={limiteMin} 
            y2={limiteMax} 
            fill="#10b981" 
            fillOpacity={0.06} 
            stroke="#10b981"
            strokeOpacity={0.2}
            strokeDasharray="3 3"
          />

          {/* Línea de Telemetría Real */}
          <Line 
            type="monotone" 
            dataKey="temp" 
            stroke="#f1f5f9" 
            strokeWidth={2.5} 
            dot={<CustomDot />}
            activeDot={{ r: 6 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};