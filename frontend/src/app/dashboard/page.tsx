"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

const roles = ["Admin", "Operador", "Auditor"] as const;

type UserPayload = {
  sub?: string;
  email?: string;
  rol?: "Admin" | "Operador" | "Auditor";
};

type ManagedUser = {
  id: string;
  email: string;
  rol: "Admin" | "Operador" | "Auditor";
};

type EditUserState = {
  id: string;
  email: string;
  password: string;
  rol: (typeof roles)[number];
};

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserPayload | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [editUser, setEditUser] = useState<EditUserState | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [status, setStatus] = useState("Cargando...");

  const getToken = () => localStorage.getItem("accessToken");

  const loadUsers = async (token: string) => {
    setUsersLoading(true);
    setUsersError("");

    try {
      const response = await fetch(`${API_URL}/auth/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error("No se pudo cargar la lista de usuarios.");
      }

      const data = (await response.json()) as { users?: ManagedUser[] };
      setUsers(Array.isArray(data.users) ? data.users : []);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo cargar la lista de usuarios.";
      setUsersError(message);
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    const token = getToken();
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

        if (data.user?.rol === "Admin") {
          await loadUsers(token);
        }
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

  const handleStartEdit = (userItem: ManagedUser) => {
    setEditUser({
      id: userItem.id,
      email: userItem.email,
      password: "",
      rol: userItem.rol,
    });
  };

  const handleCancelEdit = () => {
    setEditUser(null);
  };

  const handleUpdateUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!editUser) {
      return;
    }

    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }

    if (!editUser.email.trim()) {
      setUsersError("El email no puede estar vacio.");
      return;
    }

    if (editUser.password && editUser.password.length < 6) {
      setUsersError("La nueva contraseña debe tener al menos 6 caracteres.");
      return;
    }

    setActionLoading(true);
    setUsersError("");

    try {
      const response = await fetch(`${API_URL}/auth/users/${editUser.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: editUser.email.trim(),
          ...(editUser.password ? { password: editUser.password } : {}),
          rol: editUser.rol,
        }),
      });

      if (!response.ok) {
        throw new Error("No se pudo actualizar el usuario.");
      }

      setEditUser(null);
      await loadUsers(token);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo actualizar el usuario.";
      setUsersError(message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }

    if (!window.confirm("¿Eliminar este usuario?")) {
      return;
    }

    setActionLoading(true);
    setUsersError("");

    try {
      const response = await fetch(`${API_URL}/auth/users/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error("No se pudo eliminar el usuario.");
      }

      if (editUser?.id === userId) {
        setEditUser(null);
      }

      await loadUsers(token);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo eliminar el usuario.";
      setUsersError(message);
    } finally {
      setActionLoading(false);
    }
  };

  const roleLabel = user?.rol ?? "Sin rol";

  if (status) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.14),_transparent_40%),radial-gradient(circle_at_bottom_right,_rgba(244,114,182,0.1),_transparent_35%)]" />
        <div className="relative mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 backdrop-blur">
            {status}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.16),_transparent_38%),radial-gradient(circle_at_bottom_right,_rgba(244,114,182,0.08),_transparent_30%)]" />
      <div className="relative mx-auto grid min-h-screen w-full max-w-[1600px] lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="border-b border-white/5 bg-slate-950/90 px-6 py-6 backdrop-blur lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:border-white/5 lg:px-5 lg:py-8">
          <div className="flex items-center justify-between lg:block">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.34em] text-cyan-300">
                Coldcase Control
              </p>
              <h1 className="mt-3 text-2xl font-semibold">{user?.rol === "Admin" ? "Control total del sistema" : "Panel central"}</h1>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 lg:hidden"
            >
              Salir
            </button>
          </div>

          <div className="mt-6 rounded-3xl border border-slate-800 bg-slate-900/80 p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Sesión</p>
            <h2 className="mt-3 text-lg font-semibold">{user?.email ?? "Usuario autenticado"}</h2>
            <div className={`mt-4 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${user?.rol === "Admin" ? "border-cyan-400/40 bg-cyan-500/10 text-cyan-100" : "border-slate-700 bg-slate-800 text-slate-200"}`}>
              {roleLabel}
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              {user?.rol === "Admin"
                ? "Supervisa usuarios, incidentes sellados y el estado general del sistema."
                : "Acceso a la plataforma de monitoreo logístico."}
            </p>
          </div>

          <nav className="mt-6 space-y-2 text-sm">
            <Link href="/dashboard" className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-slate-100 transition hover:border-cyan-400/40 hover:bg-slate-900">
              <span>Resumen operativo</span>
              <span className="text-slate-500">01</span>
            </Link>
            <Link href="/register" className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-slate-100 transition hover:border-cyan-400/40 hover:bg-slate-900">
              <span>Alta de usuarios</span>
              <span className="text-slate-500">02</span>
            </Link>
            <Link href="/ia" className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-slate-100 transition hover:border-cyan-400/40 hover:bg-slate-900">
              <span>Analítica IA</span>
              <span className="text-slate-500">03</span>
            </Link>
            <Link href="/telemetria" className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-slate-100 transition hover:border-cyan-400/40 hover:bg-slate-900">
              <span>Telemetría</span>
              <span className="text-slate-500">04</span>
            </Link>
            <Link href="/setup" className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-slate-100 transition hover:border-cyan-400/40 hover:bg-slate-900">
              <span>Preparar ruta</span>
              <span className="text-slate-500">05</span>
            </Link>
          </nav>

          <button
            onClick={handleLogout}
            className="mt-6 inline-flex w-full items-center justify-center rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-100 transition hover:border-rose-300 hover:bg-rose-500/15"
          >
            Cerrar sesión
          </button>
        </aside>
        <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8 lg:h-screen lg:overflow-y-auto">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
            <section className="rounded-[2rem] border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-cyan-500/5 backdrop-blur sm:p-8">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.32em] text-cyan-300">
                    Monitoreo de cadena de frío
                  </p>
                  <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">
                    Bienvenido{user?.email ? `, ${user.email}` : ""}
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                    El sistema centraliza ubicación, temperatura, humedad e incidentes inmutables para la exportación terrestre de alimentos.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm sm:min-w-72">
                  <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4">
                    <p className="text-emerald-200/80">Estado</p>
                    <p className="mt-2 text-lg font-semibold text-emerald-100">En ruta</p>
                  </div>
                  <div className="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 p-4">
                    <p className="text-cyan-200/80">Incidentes</p>
                    <p className="mt-2 text-lg font-semibold text-cyan-100">0 críticos</p>
                  </div>
                </div>
              </div>

              <div className="mt-8 grid gap-4 md:grid-cols-4">
                {[
                  { label: "Temp. actual", value: "4.8°C", accent: "from-cyan-400 to-cyan-200" },
                  { label: "Humedad", value: "61%", accent: "from-emerald-400 to-emerald-200" },
                  { label: "Batería IoT", value: "84%", accent: "from-amber-400 to-amber-200" },
                  { label: "Desvío", value: "0.6 km", accent: "from-fuchsia-400 to-fuchsia-200" },
                ].map((item) => (
                  <div key={item.label} className="rounded-3xl border border-slate-800 bg-slate-950/60 p-5">
                    <p className="text-sm text-slate-400">{item.label}</p>
                    <p className={`mt-4 bg-gradient-to-r ${item.accent} bg-clip-text text-3xl font-semibold text-transparent`}>
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-8 rounded-3xl border border-slate-800 bg-slate-950/60 p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Hoja de ruta</h3>
                  <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">GPS activo</span>
                </div>
                <div className="mt-5 space-y-4">
                  {[
                    "Salida desde centro de acopio con contenedor precintado.",
                    "Cruce por zonas térmicas con monitoreo continuo de temperatura y humedad.",
                    "Validación de geofencing y batería del dispositivo de monitoreo.",
                    "Registro inmutable del incidente si se supera el umbral crítico.",
                  ].map((step, index) => (
                    <div key={step} className="flex gap-4">
                      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-500/10 text-xs font-semibold text-cyan-100">
                        {index + 1}
                      </div>
                      <p className="text-sm leading-6 text-slate-300">{step}</p>
                    </div>
                  ))}
                </div>
              </div>

              {user?.rol === "Admin" && (
                <div className="rounded-3xl border border-slate-800 bg-slate-950/60 p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Usuarios creados</h3>
                    <span className="text-sm text-slate-400">{usersLoading ? "Cargando..." : `${users.length} registros`}</span>
                  </div>

                  {usersError && (
                    <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                      {usersError}
                    </div>
                  )}

                  {editUser && (
                    <form onSubmit={handleUpdateUser} className="mt-6 rounded-2xl border border-cyan-400/20 bg-cyan-500/5 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">Editar usuario</p>
                          <h4 className="mt-2 text-base font-semibold">{editUser.email}</h4>
                        </div>
                        <button type="button" onClick={handleCancelEdit} className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500">
                          Cancelar
                        </button>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <label className="text-sm font-semibold text-slate-200 md:col-span-2">
                          Email
                          <input
                            type="email"
                            value={editUser.email}
                            onChange={(event) => setEditUser({ ...editUser, email: event.target.value })}
                            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white focus:border-cyan-300 focus:outline-none"
                            required
                          />
                        </label>
                        <label className="text-sm font-semibold text-slate-200">
                          Rol
                          <select
                            value={editUser.rol}
                            onChange={(event) => setEditUser({ ...editUser, rol: event.target.value as EditUserState["rol"] })}
                            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white focus:border-cyan-300 focus:outline-none"
                          >
                            {roles.map((role) => (
                              <option key={role} value={role}>
                                {role}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-sm font-semibold text-slate-200 md:col-span-2">
                          Nueva contraseña
                          <input
                            type="password"
                            value={editUser.password}
                            onChange={(event) => setEditUser({ ...editUser, password: event.target.value })}
                            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white focus:border-cyan-300 focus:outline-none"
                            placeholder="Opcional"
                            minLength={6}
                          />
                        </label>
                        <button type="submit" disabled={actionLoading} className="inline-flex items-center justify-center rounded-full bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-70">
                          {actionLoading ? "Guardando..." : "Guardar"}
                        </button>
                      </div>
                    </form>
                  )}

                  <div className="mt-6 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
                    {usersLoading ? (
                      <div className="p-5 text-sm text-slate-300">Cargando usuarios...</div>
                    ) : users.length === 0 ? (
                      <div className="p-5 text-sm text-slate-300">No hay usuarios registrados todavía.</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
                          <thead className="bg-slate-950/80 text-slate-400">
                            <tr>
                              <th className="px-5 py-4 font-semibold">Email</th>
                              <th className="px-5 py-4 font-semibold">Rol</th>
                              <th className="px-5 py-4 font-semibold">Acciones</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            {users.map((userItem) => (
                              <tr key={userItem.id} className="bg-slate-900/30">
                                <td className="px-5 py-4 text-slate-100">{userItem.email}</td>
                                <td className="px-5 py-4 text-slate-300">{userItem.rol}</td>
                                <td className="px-5 py-4">
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleStartEdit(userItem)}
                                      className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-xs font-semibold text-cyan-100 transition hover:border-cyan-300"
                                    >
                                      Editar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteUser(userItem.id)}
                                      disabled={actionLoading}
                                      className="rounded-full border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-100 transition hover:border-rose-300 disabled:cursor-not-allowed disabled:opacity-70"
                                    >
                                      Eliminar
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
