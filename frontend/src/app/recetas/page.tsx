"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/config";
import { apiFetch } from "@/lib/api";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Edit3,
  Thermometer,
  Droplets,
  BookOpen,
  CheckCircle,
  AlertCircle,
  Info,
} from "lucide-react";

type UserPayload = {
  sub?: string;
  email?: string;
  rol?: "Admin" | "Operador";
};

type Receta = {
  id: string;
  nombre: string;
  limite_min_temp: number;
  limite_max_temp: number;
  limite_min_humedad: number;
  limite_max_humedad: number;
};

type FormState = {
  id: string;
  nombre: string;
  limite_min_temp: string;
  limite_max_temp: string;
  limite_min_humedad: string;
  limite_max_humedad: string;
};

export default function RecetasPage() {
  const router = useRouter();
  const [recetas, setRecetas] = useState<Receta[]>([]);
  const [loading, setLoading] = useState(false);
  const [recetasLoading, setRecetasLoading] = useState(false);
  const [recetasError, setRecetasError] = useState("");
  const [authorizing, setAuthorizing] = useState(true);
  const [status, setStatus] = useState<
    { type: "success" | "error"; message: string } | null
  >(null);

  // Form states
  const [id, setId] = useState("");
  const [nombre, setNombre] = useState("");
  const [minTemp, setMinTemp] = useState("");
  const [maxTemp, setMaxTemp] = useState("");
  const [minHumedad, setMinHumedad] = useState("");
  const [maxHumedad, setMaxHumedad] = useState("");

  const [editReceta, setEditReceta] = useState<Receta | null>(null);

  const loadRecetas = async () => {
    setRecetasLoading(true);
    setRecetasError("");

    try {
      const response = await apiFetch(`${API_URL}/perfil-producto`);

      if (!response.ok) {
        throw new Error("No pudimos cargar la lista de recetas.");
      }

      const data = (await response.json()) as Receta[];
      setRecetas(Array.isArray(data) ? data : []);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No pudimos cargar la lista de recetas.";
      setRecetasError(message);
    } finally {
      setRecetasLoading(false);
    }
  };

  useEffect(() => {
    const validateAdmin = async () => {
      const stored = localStorage.getItem("currentUser");
      if (!stored) {
        router.replace("/login");
        return;
      }

      try {
        const response = await apiFetch(`${API_URL}/auth/me`);

        if (!response.ok) {
          throw new Error("No autorizado");
        }

        const data = (await response.json()) as { user?: UserPayload };
        if (data.user?.rol !== "Admin") {
          router.replace("/dashboard");
          return;
        }

        setAuthorizing(false);
        await loadRecetas();
      } catch {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("currentUser");
        router.replace("/login");
      }
    };

    void validateAdmin();
  }, [router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setStatus(null);

    const storedUser = localStorage.getItem("currentUser");
    if (!storedUser) {
      setStatus({
        type: "error",
        message: "Tu sesión expiró. Inicia sesión otra vez.",
      });
      router.replace("/login");
      setLoading(false);
      return;
    }

    const payload = {
      id: id.trim().toLowerCase(),
      nombre: nombre.trim(),
      limite_min_temp: parseFloat(minTemp),
      limite_max_temp: parseFloat(maxTemp),
      limite_min_humedad: parseFloat(minHumedad),
      limite_max_humedad: parseFloat(maxHumedad),
    };

    if (payload.limite_min_temp > payload.limite_max_temp) {
      setStatus({
        type: "error",
        message: "La temperatura mínima no puede ser mayor que la máxima.",
      });
      setLoading(false);
      return;
    }

    if (payload.limite_min_humedad > payload.limite_max_humedad) {
      setStatus({
        type: "error",
        message: "La humedad mínima no puede ser mayor que la máxima.",
      });
      setLoading(false);
      return;
    }

    try {
      const response = await apiFetch(`${API_URL}/perfil-producto`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let errorMessage = "No pudimos crear la receta.";
        try {
          const errorJson = await response.json();
          if (typeof errorJson?.message === "string") {
            errorMessage = errorJson.message;
          } else if (Array.isArray(errorJson?.message)) {
            errorMessage = errorJson.message.join(", ");
          }
        } catch {
          const errorText = await response.text();
          if (errorText) {
            errorMessage = errorText;
          }
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setId("");
      setNombre("");
      setMinTemp("");
      setMaxTemp("");
      setMinHumedad("");
      setMaxHumedad("");
      setStatus({
        type: "success",
        message: `Receta "${data.nombre}" creada correctamente.`,
      });

      await loadRecetas();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Error inesperado.";
      setStatus({ type: "error", message });
    } finally {
      setLoading(false);
    }
  };

  const handleStartEdit = (receta: Receta) => {
    setEditReceta(receta);
    setNombre(receta.nombre);
    setMinTemp(receta.limite_min_temp.toString());
    setMaxTemp(receta.limite_max_temp.toString());
    setMinHumedad(receta.limite_min_humedad.toString());
    setMaxHumedad(receta.limite_max_humedad.toString());
    setStatus(null);
  };

  const handleCancelEdit = () => {
    setEditReceta(null);
    setId("");
    setNombre("");
    setMinTemp("");
    setMaxTemp("");
    setMinHumedad("");
    setMaxHumedad("");
  };

  const handleUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editReceta) return;

    setLoading(true);
    setStatus(null);

    const payload = {
      nombre: nombre.trim(),
      limite_min_temp: parseFloat(minTemp),
      limite_max_temp: parseFloat(maxTemp),
      limite_min_humedad: parseFloat(minHumedad),
      limite_max_humedad: parseFloat(maxHumedad),
    };

    if (payload.limite_min_temp > payload.limite_max_temp) {
      setStatus({
        type: "error",
        message: "La temperatura mínima no puede ser mayor que la máxima.",
      });
      setLoading(false);
      return;
    }

    if (payload.limite_min_humedad > payload.limite_max_humedad) {
      setStatus({
        type: "error",
        message: "La humedad mínima no puede ser mayor que la máxima.",
      });
      setLoading(false);
      return;
    }

    try {
      const response = await apiFetch(
        `${API_URL}/perfil-producto/${editReceta.id}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        let errorMessage = "No pudimos actualizar la receta.";
        try {
          const errorJson = await response.json();
          if (typeof errorJson?.message === "string") {
            errorMessage = errorJson.message;
          } else if (Array.isArray(errorJson?.message)) {
            errorMessage = errorJson.message.join(", ");
          }
        } catch {
          const errorText = await response.text();
          if (errorText) {
            errorMessage = errorText;
          }
        }
        throw new Error(errorMessage);
      }

      setStatus({
        type: "success",
        message: "Receta actualizada correctamente.",
      });
      handleCancelEdit();
      await loadRecetas();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Error inesperado.";
      setStatus({ type: "error", message });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (recetaId: string) => {
    if (
      !window.confirm(
        "¿Seguro que deseas eliminar esta receta? Los viajes asociados quedarán huérfanos de perfil pero no se eliminarán.",
      )
    ) {
      return;
    }

    setLoading(true);
    setStatus(null);

    try {
      const response = await apiFetch(`${API_URL}/perfil-producto/${recetaId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        let errorMessage = "No pudimos eliminar la receta.";
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
        throw new Error(errorMessage);
      }

      setStatus({
        type: "success",
        message: "Receta eliminada correctamente.",
      });
      if (editReceta?.id === recetaId) {
        handleCancelEdit();
      }
      await loadRecetas();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Error inesperado.";
      setStatus({ type: "error", message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white relative overflow-x-hidden">
      {/* Background ambient glow */}
      <div className="absolute top-0 right-1/4 w-[400px] h-[400px] bg-cyan-500/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-12">
        {/* TOP BAR / BACK LINK */}
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-white/[0.06] mb-8">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-zinc-950/60 text-cyan-400 border border-cyan-500/20 tracking-widest uppercase">
                Panel de Configuración
              </span>
            </div>
            <h1 className="text-2xl font-extrabold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent font-sans">
              Gestor de Recetas (Perfiles de Producto)
            </h1>
            <p className="text-[11px] text-zinc-500 font-mono">
              Configura límites óptimos de temperatura y humedad para el transporte de mercancías.
            </p>
          </div>

          <a
            href="/dashboard"
            className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-300 hover:text-white bg-zinc-950 border border-white/10 hover:border-white/20 rounded-xl px-4 py-2.5 transition-all duration-300 shadow-md shadow-black/40 hover:scale-[1.02] cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Volver al Dashboard</span>
          </a>
        </header>

        {authorizing ? (
          <div className="flex-grow flex items-center justify-center border border-dashed border-white/[0.06] rounded-3xl p-12 bg-zinc-950/20 text-center min-h-[300px]">
            <div className="max-w-md">
              <div className="w-10 h-10 border-2 border-zinc-700 border-t-cyan-500 rounded-full animate-spin mx-auto mb-4" />
              <span className="text-xs text-zinc-400 font-bold uppercase tracking-wider block">
                Verificando Credenciales
              </span>
              <p className="text-[10px] text-zinc-500 font-mono mt-2 leading-relaxed">
                Comprobando permisos administrativos en el backend seguro...
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* LEFT COLUMN: FORM */}
            <div className="lg:col-span-5 flex flex-col gap-5">
              <div className="bg-zinc-950/60 border border-white/[0.06] backdrop-blur-md p-6 rounded-2xl shadow-xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />

                <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-1.5 font-sans">
                  {editReceta ? (
                    <>
                      <Edit3 className="w-4 h-4 text-cyan-400" />
                      Editar Receta
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 text-cyan-400" />
                      Registrar Nueva Receta
                    </>
                  )}
                </h2>
                <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest pb-3.5 border-b border-white/[0.04] mb-4">
                  {editReceta
                    ? "ACTUALIZAR UMBRALES DE CALIDAD"
                    : "INGRESAR NUEVO PERFIL DE TEMPERATURA"}
                </p>

                <form
                  onSubmit={editReceta ? handleUpdate : handleSubmit}
                  className="flex flex-col gap-4"
                >
                  {/* ID Input (Only when creating) */}
                  {!editReceta && (
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest flex items-center justify-between">
                        <span>Código Identificador (ID)</span>
                        <span className="text-[8px] font-mono text-zinc-650">
                          Minúsculas, sin espacios
                        </span>
                      </label>
                      <input
                        type="text"
                        value={id}
                        onChange={(e) => setId(e.target.value)}
                        placeholder="ej. vacunas-ultracongeladas"
                        className="w-full bg-zinc-900/30 border border-white/[0.06] hover:border-white/12 focus:border-cyan-500/40 rounded-xl px-4 py-2.5 text-xs text-white placeholder-zinc-700 outline-none focus:ring-1 focus:ring-cyan-500/10 font-mono transition-all duration-200"
                        required
                        pattern="^[a-z0-9-_]+$"
                      />
                    </div>
                  )}

                  {/* Nombre Input */}
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest flex items-center justify-between">
                      <span>Nombre del Perfil</span>
                    </label>
                    <input
                      type="text"
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                      placeholder="ej. Medicamentos Ultra (CRT)"
                      className="w-full bg-zinc-900/30 border border-white/[0.06] hover:border-white/12 focus:border-cyan-500/40 rounded-xl px-4 py-2.5 text-xs text-white placeholder-zinc-700 outline-none focus:ring-1 focus:ring-cyan-500/10 font-mono transition-all duration-200"
                      required
                    />
                  </div>

                  {/* Rangos de Temperatura */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">
                        Temp Mínima (°C)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={minTemp}
                        onChange={(e) => setMinTemp(e.target.value)}
                        placeholder="-20"
                        className="w-full bg-zinc-900/30 border border-white/[0.06] hover:border-white/12 focus:border-cyan-500/40 rounded-xl px-4 py-2.5 text-xs text-white placeholder-zinc-700 outline-none focus:ring-1 focus:ring-cyan-500/10 font-mono transition-all duration-200"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">
                        Temp Máxima (°C)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={maxTemp}
                        onChange={(e) => setMaxTemp(e.target.value)}
                        placeholder="-15"
                        className="w-full bg-zinc-900/30 border border-white/[0.06] hover:border-white/12 focus:border-cyan-500/40 rounded-xl px-4 py-2.5 text-xs text-white placeholder-zinc-700 outline-none focus:ring-1 focus:ring-cyan-500/10 font-mono transition-all duration-200"
                        required
                      />
                    </div>
                  </div>

                  {/* Rangos de Humedad */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">
                        Humedad Mín (%)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={minHumedad}
                        onChange={(e) => setMinHumedad(e.target.value)}
                        placeholder="0"
                        className="w-full bg-zinc-900/30 border border-white/[0.06] hover:border-white/12 focus:border-cyan-500/40 rounded-xl px-4 py-2.5 text-xs text-white placeholder-zinc-700 outline-none focus:ring-1 focus:ring-cyan-500/10 font-mono transition-all duration-200"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">
                        Humedad Máx (%)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={maxHumedad}
                        onChange={(e) => setMaxHumedad(e.target.value)}
                        placeholder="100"
                        className="w-full bg-zinc-900/30 border border-white/[0.06] hover:border-white/12 focus:border-cyan-500/40 rounded-xl px-4 py-2.5 text-xs text-white placeholder-zinc-700 outline-none focus:ring-1 focus:ring-cyan-500/10 font-mono transition-all duration-200"
                        required
                      />
                    </div>
                  </div>

                  {/* Info alert */}
                  <div className="bg-[#050505] border border-white/[0.04] p-3.5 rounded-xl space-y-2 mt-2">
                    <div className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5 font-sans">
                      <Info className="w-3 h-3 text-zinc-400" />
                      Límites Operacionales
                    </div>
                    <p className="text-[9px] text-zinc-500 font-mono leading-normal">
                      Estos rangos de control serán aplicados al iniciar nuevos viajes. La telemetría que exceda estas cotas generará incidentes de forma automática y alertará a la central.
                    </p>
                  </div>

                  {status && (
                    <div
                      className={`flex items-start gap-2.5 rounded-xl border p-4 text-xs font-mono leading-relaxed mt-2 ${
                        status.type === "success"
                          ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-450"
                          : "border-rose-500/20 bg-rose-500/5 text-rose-450"
                      }`}
                    >
                      {status.type === "success" ? (
                        <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <span className="font-bold uppercase tracking-wider block mb-0.5">
                          {status.type === "success"
                            ? "Operación Exitosa"
                            : "Error en Solicitud"}
                        </span>
                        {status.message}
                      </div>
                    </div>
                  )}

                  {/* Buttons */}
                  <div className="flex gap-2.5 mt-3">
                    {editReceta && (
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        className="flex-1 bg-zinc-900 hover:bg-zinc-800 border border-white/10 hover:border-white/20 text-white font-bold rounded-xl py-2.5 text-[10px] uppercase tracking-wider transition-all duration-200 cursor-pointer active:scale-[0.98]"
                      >
                        Cancelar
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-1 bg-white hover:bg-zinc-200 text-black font-bold rounded-xl py-2.5 text-[10px] uppercase tracking-wider transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-white/5 active:scale-[0.98]"
                    >
                      {loading
                        ? editReceta
                          ? "Guardando..."
                          : "Creando..."
                        : editReceta
                          ? "Guardar Cambios"
                          : "Crear Receta"}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* RIGHT COLUMN: LIST */}
            <div className="lg:col-span-7 flex flex-col gap-5">
              <div className="bg-zinc-950/40 border border-white/[0.06] backdrop-blur-md p-6 rounded-2xl shadow-xl flex flex-col min-h-[480px]">
                <div className="flex items-center justify-between pb-3.5 border-b border-white/[0.04] mb-4 shrink-0">
                  <div>
                    <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2 font-sans">
                      <BookOpen className="w-4 h-4 text-indigo-400" />
                      Recetas de Temperatura Activas
                    </h2>
                    <p className="text-[8px] text-zinc-500 font-mono tracking-widest uppercase mt-0.5">
                      Catálogo de umbrales regulados
                    </p>
                  </div>
                  <span className="text-[10px] font-mono font-bold uppercase px-2.5 py-0.5 rounded-full bg-zinc-900 border border-white/10 text-zinc-400 tracking-wider">
                    Total: {recetas.length}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pr-1.5 scrollbar-thin scrollbar-thumb-white/5 scrollbar-track-transparent max-h-[500px]">
                  {recetasLoading ? (
                    <div className="flex items-center justify-center py-12 text-zinc-500 text-xs font-mono gap-2.5">
                      <div className="w-4 h-4 border-2 border-zinc-700 border-t-white rounded-full animate-spin" />
                      Cargando catálogo...
                    </div>
                  ) : recetasError ? (
                    <div className="flex items-center justify-center py-12 text-rose-400 text-xs font-mono gap-2 border border-dashed border-rose-500/20 bg-rose-500/5 rounded-xl p-4">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      {recetasError}
                    </div>
                  ) : recetas.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-white/[0.06] rounded-xl bg-zinc-950/20 p-6">
                      <BookOpen className="w-8 h-8 text-zinc-650 mb-3" />
                      <span className="text-xs font-semibold text-zinc-400">
                        Sin recetas
                      </span>
                      <p className="text-[10px] text-zinc-500 font-mono mt-1 max-w-xs leading-normal">
                        No hay perfiles configurados. Usa el formulario para crear la primera receta de producto.
                      </p>
                    </div>
                  ) : (
                    recetas.map((item) => (
                      <div
                        key={item.id}
                        className={`bg-zinc-950/60 border rounded-xl p-4 flex items-center justify-between gap-4 transition-all duration-200 hover:border-white/12 hover:bg-zinc-900/10 ${
                          editReceta?.id === item.id
                            ? "border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.03)]"
                            : "border-white/[0.03]"
                        }`}
                      >
                        <div className="min-w-0 space-y-1.5">
                          <div>
                            <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-zinc-900 border border-white/5 text-zinc-400 tracking-wider">
                              ID: {item.id}
                            </span>
                          </div>
                          <h3 className="text-xs font-bold text-zinc-200 truncate font-mono">
                            {item.nombre}
                          </h3>

                          {/* Chips and limits summary */}
                          <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-550 flex-wrap">
                            <span className="flex items-center gap-1">
                              <Thermometer className="w-3.5 h-3.5 text-rose-500/70" />
                              <span>
                                {item.limite_min_temp}°C a{" "}
                                {item.limite_max_temp}°C
                              </span>
                            </span>
                            <span className="flex items-center gap-1">
                              <Droplets className="w-3.5 h-3.5 text-cyan-500/70" />
                              <span>
                                {item.limite_min_humedad}% a{" "}
                                {item.limite_max_humedad}%
                              </span>
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleStartEdit(item)}
                            title="Editar receta"
                            className="p-2 text-zinc-400 hover:text-white bg-zinc-950 border border-white/5 hover:border-white/10 rounded-lg hover:scale-105 transition-all cursor-pointer active:scale-95"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(item.id)}
                            title="Eliminar receta"
                            className="p-2 text-zinc-600 hover:text-rose-400 bg-zinc-950 border border-white/5 hover:border-white/10 rounded-lg hover:scale-105 transition-all cursor-pointer active:scale-95"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
