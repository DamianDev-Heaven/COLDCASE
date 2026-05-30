"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/config";
import { apiFetch } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<
    { type: "success" | "error"; message: string } | null
  >(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setStatus(null);

    try {
      const response = await apiFetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        let errorMessage = "No pudimos iniciar sesion.";
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

        if (errorMessage.includes("Credenciales invalidas")) {
          errorMessage = "Email o password incorrectos.";
        }

        throw new Error(errorMessage);
      }

      const data = await response.json();
      if (data.accessToken) {
        localStorage.setItem("accessToken", data.accessToken);
      }
      localStorage.setItem("currentUser", JSON.stringify(data.user));
      setStatus({ type: "success", message: "Login correcto. Redirigiendo..." });
      router.push("/dashboard");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado.";
      setStatus({ type: "error", message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-black px-5 py-5 text-white sm:px-8 lg:px-10">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:72px_72px] opacity-[0.08]" />

      <main className="relative z-10 mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-[1120px] flex-col">
        <header className="flex items-center justify-between border-b border-white/18 pb-2 pt-2 animate-fade-up">
          <a href="/" className="flex items-end gap-2 transition hover:opacity-80">
            <span className="text-[26px] font-black tracking-[-0.04em] leading-none sm:text-[31px]">
              COLDCASE
            </span>
            <span className="pb-0.5 text-[11px] font-medium uppercase tracking-[0.22em] text-white/72 sm:text-sm">
              Control
            </span>
          </a>

          <nav className="hidden items-center gap-10 text-sm font-semibold uppercase tracking-[0.18em] text-white/88 md:flex">
            <a className="transition hover:text-white/60" href="/">
              Inicio
            </a>
            <a className="transition hover:text-white/60" href="/ia">
              Probar IA
            </a>
          </nav>
        </header>

        <section className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[0.95fr_1.05fr] lg:gap-14 lg:py-14">
          <div className="max-w-xl animate-fade-up animation-delay-150">
            <div className="mb-7 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.38em] text-white/38">
              <span className="h-2 w-2 rounded-full bg-white/50 shadow-[0_0_18px_rgba(255,255,255,0.22)] animate-pulse" />
              Acceso privado
            </div>

            <h1 className="max-w-[10ch] text-5xl font-black uppercase leading-[0.92] tracking-[-0.06em] sm:text-6xl lg:text-[72px]">
              Iniciar sesión
            </h1>

            <p className="mt-4 max-w-[28rem] text-lg font-medium text-white/40 sm:text-[21px]">
              Entra al panel privado para administrar usuarios, sucursales, viajes e incidentes con el mismo lenguaje visual de la plataforma.
            </p>

            <div className="mt-9 grid max-w-[30rem] grid-cols-3 gap-3 text-xs uppercase tracking-[0.18em] text-white/48 animate-fade-up animation-delay-300">
              <div className="rounded-2xl border border-white/10 bg-white/3 px-4 py-3">
                JWT seguro
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/3 px-4 py-3">
                Panel privado
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/3 px-4 py-3">
                Alta controlada
              </div>
            </div>

            <div className="mt-10 rounded-[14px] border border-white/14 bg-[#070707] p-5 text-sm leading-6 text-white/62 transition duration-300 hover:border-white/22 hover:bg-[#090909]">
              El acceso del sistema permanece separado del alta administrativa. Si no tienes credenciales, solicita un usuario autorizado desde el equipo operativo.
              <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/42">
                <span className="rounded-full border border-white/10 bg-black px-3 py-1">Sesión segura</span>
                <span className="rounded-full border border-white/10 bg-black px-3 py-1">Acceso privado</span>
                <span className="rounded-full border border-white/10 bg-black px-3 py-1">Sin alta pública</span>
              </div>
            </div>
          </div>

          <div className="animate-fade-up animation-delay-300">
            <div className="rounded-[14px] border border-white/32 bg-[#070707] p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] transition duration-300 hover:border-white/42 hover:bg-[#090909] sm:p-7">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[17px] font-black uppercase tracking-[-0.03em]">
                    Login
                  </p>
                  <p className="mt-2 max-w-lg text-sm leading-6 text-white/60 sm:text-[15px]">
                    Ingresa tus credenciales para obtener el token JWT y entrar al dashboard privado.
                  </p>
                </div>
                <div className="hidden rounded-full border border-white/12 bg-black px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/48 sm:block animate-fade-up animation-delay-450">
                  Coldcase Auth
                </div>
              </div>

              <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
                <label className="text-sm font-semibold text-white/80">
                  Email
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="mt-2 w-full rounded-md border border-white/16 bg-black px-4 py-3 text-white outline-none transition duration-300 placeholder:text-white/22 focus:border-white/34 focus:bg-[#090909]"
                    placeholder="admin@coldcase.com"
                    autoComplete="email"
                    required
                  />
                </label>

                <label className="text-sm font-semibold text-white/80">
                  Password
                  <div className="mt-2 flex items-center overflow-hidden rounded-md border border-white/16 bg-black transition focus-within:border-white/34 focus-within:bg-[#090909]">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="w-full bg-transparent px-4 py-3 text-white outline-none placeholder:text-white/22"
                      placeholder="********"
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((currentValue) => !currentValue)}
                      className="shrink-0 border-l border-white/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/55 transition duration-300 hover:bg-white/6 hover:text-white"
                    >
                      {showPassword ? "Ocultar" : "Ver"}
                    </button>
                  </div>
                </label>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-sm text-white/45">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-white/20 bg-black text-white accent-white"
                    />
                    Recordarme
                  </label>

                  <a href="/" className="transition hover:text-white/70">
                    Volver al inicio
                  </a>
                </div>

                <div className="grid gap-3 rounded-2xl border border-white/10 bg-black p-4 text-xs uppercase tracking-[0.2em] text-white/42 sm:grid-cols-3">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-white/60" />
                    JWT
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
                    Privado
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-white/25" />
                    Seguro
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-1 inline-flex items-center justify-center rounded-md border border-white/38 bg-black px-6 py-3 text-sm font-semibold uppercase tracking-[0.15em] text-white transition duration-300 hover:-translate-y-0.5 hover:border-white/58 hover:bg-white/6 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-white/70 animate-pulse" />
                      Ingresando...
                    </span>
                  ) : (
                    "Entrar"
                  )}
                </button>
              </form>

              {status && (
                <div
                  className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${
                    status.type === "success"
                      ? "border-emerald-400/30 bg-emerald-500/8 text-emerald-100"
                      : "border-rose-400/30 bg-rose-500/8 text-rose-100"
                  }`}
                  aria-live="polite"
                >
                  {status.message}
                </div>
              )}

              <div className="mt-6 rounded-2xl border border-white/12 bg-black p-4 text-sm text-white/55 transition duration-300 hover:border-white/18 hover:bg-[#090909]">
                El alta de usuarios y la administración completa quedan dentro del dashboard privado.
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
