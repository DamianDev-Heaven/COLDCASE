"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/config";
import { apiFetch } from "@/lib/api";
import { 
  ArrowLeft, 
  UserPlus, 
  Trash2, 
  Edit3, 
  Mail, 
  Key, 
  Users, 
  CheckCircle, 
  AlertCircle,
  ChevronDown,
  Info,
  Eye,
  EyeOff
} from "lucide-react";

const roles = ["Admin", "Operador"] as const;

type UserPayload = {
  sub?: string;
  email?: string;
  rol?: "Admin" | "Operador";
};

type ManagedUser = {
  id: string;
  email: string;
  rol: "Admin" | "Operador";
};

type EditUserState = {
  id: string;
  email: string;
  password: string;
  rol: (typeof roles)[number];
};

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState<(typeof roles)[number]>("Admin");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<
    { type: "success" | "error"; message: string } | null
  >(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");
  const [editUser, setEditUser] = useState<EditUserState | null>(null);
  const [loading, setLoading] = useState(false);
  const [authorizing, setAuthorizing] = useState(true);

  const loadUsers = async () => {
    setUsersLoading(true);
    setUsersError("");

    try {
      const response = await apiFetch(`${API_URL}/auth/users`);

      if (!response.ok) {
        throw new Error("No pudimos cargar la lista de usuarios.");
      }

      const data = (await response.json()) as { users?: ManagedUser[] };
      setUsers(Array.isArray(data.users) ? data.users : []);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No pudimos cargar la lista de usuarios.";
      setUsersError(message);
    } finally {
      setUsersLoading(false);
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
        await loadUsers();
      } catch {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("currentUser");
        router.replace("/login");
      }
    };

    validateAdmin();
  }, [router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setStatus(null);

    const storedUser = localStorage.getItem("currentUser");
    if (!storedUser) {
      setStatus({ type: "error", message: "Tu sesion expiro. Inicia sesion otra vez." });
      router.replace("/login");
      setLoading(false);
      return;
    }

    try {
      const response = await apiFetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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
      setEmail("");
      setPassword("");
      setRol("Admin");
      setStatus({ type: "success", message: `Usuario ${data.user?.email ?? email} creado correctamente.` });

      await loadUsers();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado.";
      setStatus({ type: "error", message });
    } finally {
      setLoading(false);
    }
  };

  const handleStartEdit = (user: ManagedUser) => {
    setEditUser({
      id: user.id,
      email: user.email,
      password: "",
      rol: user.rol,
    });
    setStatus(null);
    setShowPassword(false);
  };

  const handleCancelEdit = () => {
    setEditUser(null);
    setShowPassword(false);
  };

  const handleUpdateUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!editUser) {
      return;
    }

    const storedUser = localStorage.getItem("currentUser");
    if (!storedUser) {
      setStatus({ type: "error", message: "Tu sesion expiro. Inicia sesion otra vez." });
      router.replace("/login");
      return;
    }

    const normalizedEmail = editUser.email.trim();
    const normalizedPassword = editUser.password.trim();

    if (!normalizedEmail) {
      setStatus({ type: "error", message: "El email no puede estar vacio." });
      return;
    }

    if (normalizedPassword && normalizedPassword.length < 6) {
      setStatus({ type: "error", message: "La nueva contraseña debe tener al menos 6 caracteres." });
      return;
    }

    setLoading(true);
    setStatus(null);

    try {
      const response = await apiFetch(`${API_URL}/auth/users/${editUser.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: normalizedEmail,
          ...(normalizedPassword ? { password: normalizedPassword } : {}),
          rol: editUser.rol,
        }),
      });

      if (!response.ok) {
        let errorMessage = "No pudimos actualizar el usuario.";
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
          errorMessage = "Este correo ya existe. Usa otro para actualizar.";
        }

        throw new Error(errorMessage);
      }

      setStatus({ type: "success", message: "Usuario actualizado correctamente." });
      setEditUser(null);
      await loadUsers();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado.";
      setStatus({ type: "error", message });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    const storedUser = localStorage.getItem("currentUser");
    if (!storedUser) {
      setStatus({ type: "error", message: "Tu sesion expiro. Inicia sesion otra vez." });
      router.replace("/login");
      return;
    }

    if (!window.confirm("¿Seguro que deseas eliminar este usuario?")) {
      return;
    }

    setLoading(true);
    setStatus(null);

    try {
      const response = await apiFetch(`${API_URL}/auth/users/${userId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        let errorMessage = "No pudimos eliminar el usuario.";
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

      setStatus({ type: "success", message: "Usuario eliminado correctamente." });
      if (editUser?.id === userId) {
        setEditUser(null);
      }
      await loadUsers();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado.";
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
                Panel de Administración
              </span>
            </div>
            <h1 className="text-2xl font-extrabold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent font-sans">
              Gestión de Accesos & Usuarios
            </h1>
            <p className="text-[11px] text-zinc-500 font-mono">
              Configura cuentas administrativas y gestiona roles para la cadena de frío de ColdCase.
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
              <span className="text-xs text-zinc-400 font-bold uppercase tracking-wider block">Verificando Credenciales</span>
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
                  {editUser ? (
                    <>
                      <Edit3 className="w-4 h-4 text-cyan-400" />
                      Editar Colaborador
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4 text-cyan-400" />
                      Registrar Colaborador
                    </>
                  )}
                </h2>
                <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest pb-3.5 border-b border-white/[0.04] mb-4">
                  {editUser ? "ACTUALIZAR CREDENCIALES DE ACCESO" : "CREAR NUEVAS CREDENCIALES DE ACCESO"}
                </p>

                <form onSubmit={editUser ? handleUpdateUser : handleSubmit} className="flex flex-col gap-4">
                  {/* Email Input */}
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest flex items-center justify-between">
                      <span>Correo Electrónico</span>
                      <span className="text-[8px] font-mono text-zinc-600">Requerido</span>
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-650" />
                      <input
                        type="email"
                        value={editUser ? editUser.email : email}
                        onChange={(e) => {
                          if (editUser) {
                            setEditUser({ ...editUser, email: e.target.value });
                          } else {
                            setEmail(e.target.value);
                          }
                        }}
                        placeholder="ej. operador@coldcase.com"
                        className="w-full bg-zinc-900/30 border border-white/[0.06] hover:border-white/12 focus:border-cyan-500/40 rounded-xl pl-9 pr-4 py-2.5 text-xs text-white placeholder-zinc-700 outline-none focus:ring-1 focus:ring-cyan-500/10 font-mono transition-all duration-200"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest flex items-center justify-between">
                      <span>Contraseña</span>
                      <span className="text-[8px] font-mono text-zinc-600">
                        {editUser ? "Opcional (Vacío para mantener)" : "Mínimo 6 caracteres"}
                      </span>
                    </label>
                    <div className="relative">
                      <Key className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-655" />
                      <input
                        type={showPassword ? "text" : "password"}
                        value={editUser ? editUser.password : password}
                        onChange={(e) => {
                          if (editUser) {
                            setEditUser({ ...editUser, password: e.target.value });
                          } else {
                            setPassword(e.target.value);
                          }
                        }}
                        placeholder={editUser ? "Sin cambios" : "••••••••"}
                        className="w-full bg-zinc-900/30 border border-white/[0.06] hover:border-white/12 focus:border-cyan-500/40 rounded-xl pl-9 pr-10 py-2.5 text-xs text-white placeholder-zinc-700 outline-none focus:ring-1 focus:ring-cyan-500/10 font-mono transition-all duration-200"
                        required={!editUser}
                        minLength={6}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors p-1 cursor-pointer"
                        title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                      >
                        {showPassword ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Rol Select */}
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Nivel de Acceso (Rol)</label>
                    <div className="relative">
                      <select
                        value={editUser ? editUser.rol : rol}
                        onChange={(e) => {
                          const val = e.target.value as (typeof roles)[number];
                          if (editUser) {
                            setEditUser({ ...editUser, rol: val });
                          } else {
                            setRol(val);
                          }
                        }}
                        className="w-full bg-zinc-900/30 border border-white/[0.06] hover:border-white/12 focus:border-cyan-500/40 rounded-xl pl-3 pr-8 py-2.5 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-cyan-500/10 appearance-none font-mono cursor-pointer transition-all duration-200"
                      >
                        {roles.map((r) => (
                          <option key={r} value={r} className="bg-zinc-950 text-zinc-200">
                            {r === "Admin" ? "Administrador" : "Operador Logístico"}
                          </option>
                        ))}
                      </select>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">
                        <ChevronDown className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>

                  {/* Info Cards */}
                  <div className="bg-[#050505] border border-white/[0.04] p-3.5 rounded-xl space-y-2 mt-2">
                    <div className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5 font-sans">
                      <Info className="w-3 h-3 text-zinc-400" />
                      Directivas de Privacidad
                    </div>
                    <p className="text-[9px] text-zinc-500 font-mono leading-normal">
                      El sistema restringe la creación y edición únicamente a usuarios con rol Admin. Se requiere sesión activa.
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
                          {status.type === "success" ? "Operación Exitosa" : "Error en Solicitud"}
                        </span>
                        {status.message}
                      </div>
                    </div>
                  )}

                  {/* Buttons */}
                  <div className="flex gap-2.5 mt-3">
                    {editUser && (
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
                      {loading ? (editUser ? "Guardando..." : "Registrando...") : (editUser ? "Guardar Cambios" : "Crear Usuario")}
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
                      <Users className="w-4 h-4 text-indigo-400" />
                      Colaboradores Activos
                    </h2>
                    <p className="text-[8px] text-zinc-500 font-mono tracking-widest uppercase mt-0.5">LISTA DE ADMINISTRACIÓN Y ACCESOS</p>
                  </div>
                  <span className="text-[10px] font-mono font-bold uppercase px-2.5 py-0.5 rounded-full bg-zinc-900 border border-white/10 text-zinc-400 tracking-wider">
                    Total: {users.length}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pr-1.5 scrollbar-thin scrollbar-thumb-white/5 scrollbar-track-transparent max-h-[500px]">
                  {usersLoading ? (
                    <div className="flex items-center justify-center py-12 text-zinc-500 text-xs font-mono gap-2.5">
                      <div className="w-4 h-4 border-2 border-zinc-700 border-t-white rounded-full animate-spin" />
                      Cargando lista de usuarios...
                    </div>
                  ) : usersError ? (
                    <div className="flex items-center justify-center py-12 text-rose-400 text-xs font-mono gap-2 border border-dashed border-rose-500/20 bg-rose-500/5 rounded-xl p-4">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      {usersError}
                    </div>
                  ) : users.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-white/[0.06] rounded-xl bg-zinc-950/20 p-6">
                      <Users className="w-8 h-8 text-zinc-650 mb-3" />
                      <span className="text-xs font-semibold text-zinc-400">Sin colaboradores</span>
                      <p className="text-[10px] text-zinc-500 font-mono mt-1 max-w-xs leading-normal">
                        No hay usuarios adicionales registrados en el sistema. Utiliza el formulario lateral para agregar personal.
                      </p>
                    </div>
                  ) : (
                    users.map((userItem) => {
                      const userInitials = userItem.email.split("@")[0].substring(0, 2).toUpperCase();
                      const isCurrentUser = (() => {
                        try {
                          const curr = localStorage.getItem("currentUser");
                          if (curr) {
                            const parsed = JSON.parse(curr);
                            return parsed.email === userItem.email;
                          }
                        } catch {}
                        return false;
                      })();
                      
                      return (
                        <div
                          key={userItem.id}
                          className={`bg-zinc-950/60 border rounded-xl p-4 flex items-center justify-between gap-4 transition-all duration-200 hover:border-white/12 hover:bg-zinc-900/10 ${
                            editUser?.id === userItem.id 
                              ? "border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.03)]" 
                              : "border-white/[0.03]"
                          }`}
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            {/* Avatar representation */}
                            <div className="w-9 h-9 rounded-xl bg-zinc-900 border border-white/10 text-white font-mono flex items-center justify-center font-bold text-xs shrink-0 select-none">
                              {userInitials}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-zinc-200 truncate font-mono max-w-[180px]">
                                  {userItem.email}
                                </span>
                                {isCurrentUser && (
                                  <span className="text-[7px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-550 border border-white/5 uppercase select-none">
                                    Tú
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 mt-1">
                                {userItem.rol === "Admin" ? (
                                  <span className="bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-bold uppercase text-[7px] px-2 py-0.5 rounded-full font-mono tracking-widest animate-pulse-once">
                                    ADMIN
                                  </span>
                                ) : (
                                  <span className="bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-bold uppercase text-[7px] px-2 py-0.5 rounded-full font-mono tracking-widest animate-pulse-once">
                                    OPERADOR
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleStartEdit(userItem)}
                              title="Editar usuario"
                              className="p-2 text-zinc-400 hover:text-white bg-zinc-950 border border-white/5 hover:border-white/10 rounded-lg hover:scale-105 transition-all cursor-pointer active:scale-95 animate-pulse-once"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(userItem.id)}
                              disabled={isCurrentUser}
                              title={isCurrentUser ? "No puedes eliminar tu propia cuenta" : "Eliminar usuario"}
                              className="p-2 text-zinc-600 hover:text-rose-400 bg-zinc-950 border border-white/5 hover:border-white/10 rounded-lg hover:scale-105 transition-all cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:text-zinc-650 active:scale-95"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
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
