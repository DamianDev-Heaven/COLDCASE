"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Building2, Truck, Thermometer } from "lucide-react";

import TelemetryChart from "@/components/TelemetryChart";
import { API_URL } from "@/lib/config";
import { apiFetch } from "@/lib/api";

type Viaje = {
  id: string;
  estado: string;
  limite_min_temp?: number;
  limite_max_temp?: number;
  inicio_viaje?: string | null;
};

type Transporte = {
  id: string;
};

type Sucursal = {
  id: string;
};

type TelemetryPoint = {
  timestamp_sensor: string;
  temp: number;
};

type UserSession = {
  rol?: "Admin" | "Operador" | "Auditor";
  role?: string;
};

export default function EstadisticasDashboard() {
  const router = useRouter();
  const [viajes, setViajes] = useState<Viaje[]>([]);
  const [transportes, setTransportes] = useState<Transporte[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [telemetria, setTelemetria] = useState<TelemetryPoint[]>([]);
  const [isTelemetryLoading, setIsTelemetryLoading] = useState(false);

  const viajeBase = useMemo(() => {
    const activos = viajes.filter((v) => v.estado === "en_curso");
    if (activos.length > 0) return activos[0];
    return viajes[0] || null;
  }, [viajes]);

  useEffect(() => {
    const stored = localStorage.getItem("currentUser");
    if (!stored) return;
    const parsed = JSON.parse(stored) as UserSession;
    const role = parsed.rol || parsed.role;
    if (role !== "Admin") {
      router.replace("/dashboard");
    }
  }, [router]);

  useEffect(() => {
    let mounted = true;

    async function loadBase() {
      try {
        const [viajesRes, transportesRes, sucursalesRes] = await Promise.all([
          apiFetch(`${API_URL}/viaje`),
          apiFetch(`${API_URL}/transporte`),
          apiFetch(`${API_URL}/sucursal`),
        ]);

        const viajesData = await viajesRes.json();
        const transportesData = await transportesRes.json();
        const sucursalesData = await sucursalesRes.json();

        if (mounted) {
          setViajes(Array.isArray(viajesData) ? viajesData : []);
          setTransportes(Array.isArray(transportesData) ? transportesData : []);
          setSucursales(Array.isArray(sucursalesData) ? sucursalesData : []);
        }
      } catch {
        if (mounted) {
          setViajes([]);
          setTransportes([]);
          setSucursales([]);
        }
      }
    }

    loadBase();
    const interval = setInterval(loadBase, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!viajeBase?.id) {
      setTelemetria([]);
      return;
    }

    let mounted = true;
    const viajeId = viajeBase.id;

    async function loadTelemetry() {
      setIsTelemetryLoading(true);
      try {
        const res = await apiFetch(`${API_URL}/telemetria/viaje/${viajeId}`);
        if (res.ok) {
          const data = await res.json();
          const sorted = Array.isArray(data)
            ? (data as TelemetryPoint[]).sort((a, b) =>
                new Date(a.timestamp_sensor).getTime() - new Date(b.timestamp_sensor).getTime()
              )
            : [];
          if (mounted) {
            setTelemetria(sorted);
          }
        }
      } finally {
        if (mounted) {
          setIsTelemetryLoading(false);
        }
      }
    }

    loadTelemetry();
    const interval = setInterval(loadTelemetry, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [viajeBase?.id]);

  const totalViajes = viajes.length;
  const viajesActivos = viajes.filter((v) => v.estado === "en_curso").length;
  const viajesFinalizados = viajes.filter((v) => v.estado === "finalizado").length;
  const viajesPendientes = viajes.filter((v) => v.estado === "pendiente").length;

  return (
    <main className="min-h-screen bg-[#05070f] text-white p-6">
      <section className="max-w-6xl mx-auto flex flex-col gap-6">
        <header className="rounded-3xl border border-white/[0.08] bg-black/80 p-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Administracion</p>
              <h1 className="text-xl font-semibold">Estadisticas del sistema</h1>
            </div>
          </div>
          <p className="text-sm text-slate-400 mt-3">Panel dedicado a indicadores y graficas clave.</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard title="Viajes totales" value={totalViajes} icon={BarChart3} />
          <StatCard title="Activos" value={viajesActivos} icon={Thermometer} />
          <StatCard title="Finalizados" value={viajesFinalizados} icon={Truck} />
          <StatCard title="Pendientes" value={viajesPendientes} icon={Building2} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-3xl border border-white/[0.08] bg-black/80 p-5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Infraestructura</p>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <MetricBlock label="Transportes" value={transportes.length} />
              <MetricBlock label="Sucursales" value={sucursales.length} />
            </div>
          </div>
          <div className="rounded-3xl border border-white/[0.08] bg-black/80 p-5 flex flex-col">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Grafica de temperatura</p>
            <div className="mt-4 flex-1">
              {viajeBase ? (
                <TelemetryChart
                  telemetryData={telemetria}
                  limiteMin={Number(viajeBase.limite_min_temp || 1)}
                  limiteMax={Number(viajeBase.limite_max_temp || 5)}
                  isLoading={isTelemetryLoading}
                />
              ) : (
                <div className="h-full min-h-[180px] flex items-center justify-center text-slate-600 text-xs font-mono">
                  Sin viajes disponibles.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-3xl border border-white/[0.08] bg-black/80 p-5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{title}</p>
        <Icon className="w-4 h-4 text-white/70" />
      </div>
      <p className="text-3xl font-semibold mt-3">{value}</p>
      <p className="text-[11px] text-slate-500 mt-1">Actualizado en tiempo real</p>
    </div>
  );
}

function MetricBlock({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-black/60 p-4">
      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="text-2xl font-semibold mt-2">{value}</p>
    </div>
  );
}
