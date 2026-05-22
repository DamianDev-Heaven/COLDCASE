"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
const roles = ["Admin", "Operador", "Auditor"] as const;

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState<(typeof roles)[number]>("Admin");
  const [status, setStatus] = useState<
    { type: "success" | "error"; message: string } | null
  >(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setStatus(null);

    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, rol }),
      });

      if (!response.ok) {
        let errorMessage = "No pudimos crear la cuenta.";
        try {
          const errorJson = await response.json();
          if (typeof errorJson?.message === "string") {
            errorMessage = errorJson.message;
          }
        } catch {
          const errorText = await response.text();
          if (errorText) {
            errorMessage = errorText;
          }
        }

        if (errorMessage.includes("correo ya esta registrado")) {
          errorMessage = "Este correo ya existe. Usa otro o inicia sesion.";
        }

        throw new Error(errorMessage);
      }

      const data = await response.json();
      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("currentUser", JSON.stringify(data.user));
      setStatus({ type: "success", message: "Registro correcto. Redirigiendo..." });
      router.push("/dashboard");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado.";
      setStatus({ type: "error", message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col justify-center px-6 py-16">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-10 shadow-2xl shadow-pink-500/10">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-pink-300">
            Registro
          </p>
          <h1 className="mt-4 text-3xl font-semibold">Crear cuenta</h1>
          <p className="mt-2 text-slate-300">
            Registra usuarios con rol Admin, Operador o Auditor.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
            <label className="text-sm font-semibold text-slate-200">
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white focus:border-pink-300 focus:outline-none"
                placeholder="admin@coldcase.com"
                required
              />
            </label>

            <label className="text-sm font-semibold text-slate-200">
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white focus:border-pink-300 focus:outline-none"
                placeholder="Minimo 6 caracteres"
                required
              />
            </label>

            <label className="text-sm font-semibold text-slate-200">
              Rol
              <select
                value={rol}
                onChange={(event) => setRol(event.target.value as (typeof roles)[number])}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white focus:border-pink-300 focus:outline-none"
              >
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 inline-flex items-center justify-center rounded-full bg-pink-400 px-6 py-3 text-sm font-semibold text-slate-900 transition hover:bg-pink-300 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? "Registrando..." : "Crear cuenta"}
            </button>
          </form>

          {status && (
            <div
              className={`mt-6 rounded-2xl border px-4 py-3 text-sm ${
                status.type === "success"
                  ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
                  : "border-rose-400/40 bg-rose-500/10 text-rose-100"
              }`}
            >
              {status.message}
            </div>
          )}

          <div className="mt-8 text-sm text-slate-400">
            Ya tienes cuenta? <a href="/login" className="text-pink-300">Inicia sesion</a>.
          </div>
        </div>
      </div>
    </div>
  );
}
