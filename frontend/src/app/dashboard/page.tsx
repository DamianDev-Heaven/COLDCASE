"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

type UserPayload = {
  sub?: string;
  email?: string;
  rol?: "Admin" | "Operador" | "Auditor";
};

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserPayload | null>(null);
  const [status, setStatus] = useState("Cargando...");

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      router.push("/login");
      return;
    }

    const loadUser = async () => {
      try {
        const response = await fetch(`${API_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          throw new Error("No autorizado");
        }

        const data = await response.json();
        setUser(data.user ?? null);
        setStatus("");
      } catch {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("currentUser");
        router.push("/login");
      }
    };

    loadUser();
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("currentUser");
    router.push("/login");
  };

  if (status) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            {status}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-16">
        <header className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">
            Dashboard
          </p>
          <h1 className="text-3xl font-semibold">Bienvenido{user?.email ? `, ${user.email}` : ""}</h1>
          <p className="text-slate-300">Rol activo: {user?.rol ?? "Sin rol"}</p>
        </header>

        <section className="grid gap-6 md:grid-cols-3">
          {user?.rol === "Admin" && (
            <div className="rounded-3xl border border-cyan-400/40 bg-slate-900/70 p-6">
              <h2 className="text-xl font-semibold">Panel Admin</h2>
              <p className="mt-2 text-slate-300">
                Gestion de usuarios, roles y accesos.
              </p>
            </div>
          )}
          {user?.rol === "Operador" && (
            <div className="rounded-3xl border border-emerald-400/40 bg-slate-900/70 p-6">
              <h2 className="text-xl font-semibold">Panel Operador</h2>
              <p className="mt-2 text-slate-300">
                Monitoreo operativo y cargas diarias.
              </p>
            </div>
          )}
          {user?.rol === "Auditor" && (
            <div className="rounded-3xl border border-pink-400/40 bg-slate-900/70 p-6">
              <h2 className="text-xl font-semibold">Panel Auditor</h2>
              <p className="mt-2 text-slate-300">
                Revisiones, historicos y reportes.
              </p>
            </div>
          )}
          <a
            href="/ia"
            className="rounded-3xl border border-emerald-400/40 bg-slate-900/70 p-6 transition hover:-translate-y-1 hover:border-emerald-300"
          >
            <h2 className="text-xl font-semibold">Analizador IA</h2>
            <p className="mt-2 text-slate-300">
              Prueba el analisis de temperatura, bateria y desvio con rutas OSRM.
            </p>
          </a>
        </section>

        <button
          onClick={handleLogout}
          className="w-fit rounded-full border border-slate-700 px-5 py-2 text-sm font-semibold text-slate-200 hover:border-slate-400"
        >
          Cerrar sesion
        </button>
      </div>
    </div>
  );
}
