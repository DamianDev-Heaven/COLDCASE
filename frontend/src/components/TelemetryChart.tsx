"use client";

import { ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, Tooltip, ReferenceArea } from "recharts";

interface TelemetryPoint {
  timestamp_sensor: string;
  temp: number;
  id?: string | number;
  viaje_id?: string;
  lat?: number | string;
  lon?: number | string;
  humedad?: number | null;
  bateria?: number | null;
  received_at?: string;
  ia_diagnosis?: string | null;
}

interface TelemetryChartProps {
  telemetryData: TelemetryPoint[];
  limiteMin: number;
  limiteMax: number;
  isLoading?: boolean;
}

interface CustomDotProps {
  cx?: number;
  cy?: number;
  payload?: TelemetryPoint;
  limiteMin?: number;
  limiteMax?: number;
}

const CustomDot = (props: CustomDotProps) => {
  const { cx, cy, payload, limiteMin, limiteMax } = props;
  if (cx === undefined || cy === undefined || !payload || limiteMin === undefined || limiteMax === undefined) return null;
  const t = payload.temp;
  const esAlta = t > limiteMax;
  const esBaja = t < limiteMin;

  if (esAlta || esBaja) {
    return (
      <g key={`dot-${payload.timestamp_sensor}`}>
        <circle 
          cx={cx} 
          cy={cy} 
          r={5.5} 
          className={`${esAlta ? "fill-rose-500" : "fill-sky-400"} stroke-[#05070f] stroke-1.5`} 
        />
      </g>
    );
  }
  return (
    <circle 
      cx={cx} 
      cy={cy} 
      r={3.5} 
      className="fill-[#38bdf8] stroke-[#05070f] stroke-1" 
      key={`dot-normal-${payload.timestamp_sensor}`} 
    />
  );
};

export default function TelemetryChart({ telemetryData, limiteMin, limiteMax, isLoading = false }: TelemetryChartProps) {
  if (isLoading) {
    return (
      <div className="w-full h-full min-h-[170px] flex flex-col justify-between p-2">
        <div className="flex justify-between items-end h-[130px] gap-2">
          <div className="w-[10%] bg-slate-800/40 h-[30%] rounded animate-pulse"></div>
          <div className="w-[15%] bg-slate-800/40 h-[50%] rounded animate-pulse delay-75"></div>
          <div className="w-[12%] bg-slate-800/40 h-[70%] rounded animate-pulse delay-100"></div>
          <div className="w-[18%] bg-slate-800/40 h-[40%] rounded animate-pulse delay-150"></div>
          <div className="w-[14%] bg-slate-800/40 h-[60%] rounded animate-pulse delay-200"></div>
          <div className="w-[16%] bg-slate-800/40 h-[85%] rounded animate-pulse delay-300"></div>
          <div className="w-[15%] bg-slate-800/40 h-[45%] rounded animate-pulse delay-500"></div>
        </div>
        <div className="h-2 bg-slate-800/40 rounded w-full mt-3 animate-pulse"></div>
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-[170px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={telemetryData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
          <XAxis 
            dataKey="timestamp_sensor" 
            tickFormatter={(t: string) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            stroke="#475569"
            fontSize={10}
          />
          <YAxis stroke="#475569" fontSize={10} domain={[limiteMin - 2, limiteMax + 2]} />
          <Tooltip 
            contentStyle={{ 
               backgroundColor: "#0a0f1d", 
               borderColor: "rgba(255, 255, 255, 0.08)", 
               borderRadius: "6px", 
               fontSize: "11px", 
               color: "#fff" 
            }} 
          />
          <ReferenceArea 
            y1={limiteMin} 
            y2={limiteMax} 
            fill="#10b981" 
            fillOpacity={0.03} 
            stroke="#10b981" 
            strokeOpacity={0.15} 
            strokeDasharray="3 3" 
          />
          <Line 
            type="monotone" 
            dataKey="temp" 
            stroke="#0ea5e9" 
            strokeWidth={2} 
            dot={<CustomDot limiteMin={limiteMin} limiteMax={limiteMax} />} 
            activeDot={{ r: 4 }} 
            isAnimationActive={false} 
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}