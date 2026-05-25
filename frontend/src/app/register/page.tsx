"use client";

import { FormEvent, useEffect, useState } from "react";
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

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState<(typeof roles)[number]>("Admin");
  const [status, setStatus] = useState<
    { type: "success" | "error"; message: string } | null
  >(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");
  const [editUser, setEditUser] = useState<EditUserState | null>(null);
  const [loading, setLoading] = useState(false);
  const [authorizing, setAuthorizing] = useState(true);

  const getAccessToken = () => localStorage.getItem("accessToken");

  const loadUsers = async (token: string) => {
    setUsersLoading(true);
    setUsersError("");

    try {
      const response = await fetch(`${API_URL}/auth/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });

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
      const token = localStorage.getItem("accessToken");
      if (!token) {
        router.replace("/login");
        return;
      }

      try {
        const response = await fetch(`${API_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          throw new Error("No autorizado");
        }

        const data = (await response.json()) as { user?: UserPayload };
        if (data.user?.rol !== "Admin") {
          router.replace("/dashboard");
          return;
        }

        setAuthorizing(false);
        await loadUsers(token);
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

    const token = getAccessToken();
    if (!token) {
      setStatus({ type: "error", message: "Tu sesion expiro. Inicia sesion otra vez." });
      router.replace("/login");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
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

      if (token) {
        await loadUsers(token);
      }
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
  };

  const handleCancelEdit = () => {
    setEditUser(null);
  };

  const handleUpdateUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!editUser) {
      return;
    }

    const token = getAccessToken();
    if (!token) {
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
      const response = await fetch(`${API_URL}/auth/users/${editUser.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
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
      await loadUsers(token);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado.";
      setStatus({ type: "error", message });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    const token = getAccessToken();
    if (!token) {
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
      const response = await fetch(`${API_URL}/auth/users/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
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
      await loadUsers(token);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado.";
      setStatus({ type: "error", message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_transparent_45%),radial-gradient(circle_at_bottom_right,_rgba(244,114,182,0.18),_transparent_35%)]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-4xl flex-col justify-center px-6 py-16">
        <div className="rounded-3xl border border-slate-800/80 bg-slate-900/80 p-10 shadow-2xl shadow-cyan-500/10 backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">
            Alta administrativa
          </p>
          <h1 className="mt-4 text-3xl font-semibold">Crear usuario</h1>
          <p className="mt-2 max-w-2xl text-slate-300">
            Este formulario queda habilitado solo para administradores autenticados.
            El acceso público se mantiene únicamente para iniciar sesion.
          </p>
          <p className="mt-3 text-sm text-slate-400">
            Aquí puedes crear usuarios y administrar los ya creados desde una sola vista.
          </p>

          {authorizing ? (
            <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-300">
              Verificando permisos de administrador...
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
              <label className="text-sm font-semibold text-slate-200">
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white focus:border-cyan-300 focus:outline-none"
                  placeholder="operador@coldcase.com"
                  required
                />
              </label>

              <label className="text-sm font-semibold text-slate-200">
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white focus:border-cyan-300 focus:outline-none"
                  placeholder="Minimo 6 caracteres"
                  required
                />
              </label>

              <label className="text-sm font-semibold text-slate-200">
                Rol
                <select
                  value={rol}
                  onChange={(event) => setRol(event.target.value as (typeof roles)[number])}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white focus:border-cyan-300 focus:outline-none"
                >
                  {roles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-3 text-sm text-slate-400 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                  El backend exige un token valido y rol Admin.
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                  El login sigue siendo publico para operar el sistema desde el exterior.
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="mt-2 inline-flex items-center justify-center rounded-full bg-cyan-400 px-6 py-3 text-sm font-semibold text-slate-900 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? "Registrando..." : "Crear usuario"}
              </button>
            </form>
          )}

          {!authorizing && (
            <section className="mt-10 rounded-3xl border border-slate-800 bg-slate-950/70 p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">
                    Usuarios creados
                  </p>
                  <h2 className="mt-3 text-2xl font-semibold">Lista de administración</h2>
                  <p className="mt-2 text-sm text-slate-400">
                    Edita email, rol o contraseña. También puedes eliminar cuentas, excepto la tuya propia.
                  </p>
                </div>
                <div className="text-sm text-slate-400">
                  Total: <span className="font-semibold text-slate-100">{users.length}</span>
                </div>
              </div>

              {editUser && (
                <form onSubmit={handleUpdateUser} className="mt-6 rounded-3xl border border-cyan-400/20 bg-cyan-500/5 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">Editar usuario</p>
                      <h3 className="mt-2 text-lg font-semibold">{editUser.email}</h3>
                      <p className="mt-2 text-sm text-slate-400">La contraseña nueva es opcional; si la dejas vacía, no se modifica.</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="rounded-full border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500"
                    >
                      Cancelar
                    </button>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <label className="text-sm font-semibold text-slate-200">
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
                      Nuevo password
                      <input
                        type="password"
                        value={editUser.password}
                        onChange={(event) => setEditUser({ ...editUser, password: event.target.value })}
                        className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white focus:border-cyan-300 focus:outline-none"
                        placeholder="Opcional"
                        minLength={6}
                      />
                    </label>
                  </div>

                  <label className="mt-4 block text-sm font-semibold text-slate-200">
                    Rol
                    <select
                      value={editUser.rol}
                      onChange={(event) => setEditUser({ ...editUser, rol: event.target.value as (typeof roles)[number] })}
                      className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white focus:border-cyan-300 focus:outline-none"
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
                    className="mt-5 inline-flex items-center justify-center rounded-full bg-cyan-400 px-6 py-3 text-sm font-semibold text-slate-900 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {loading ? "Guardando..." : "Guardar cambios"}
                  </button>
                </form>
              )}

              <div className="mt-6 overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/60">
                {usersLoading ? (
                  <div className="p-5 text-sm text-slate-300">Cargando usuarios...</div>
                ) : usersError ? (
                  <div className="p-5 text-sm text-rose-200">{usersError}</div>
                ) : users.length === 0 ? (
                  <div className="p-5 text-sm text-slate-300">Todavia no hay usuarios creados.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
                      <thead className="bg-slate-950/70 text-slate-400">
                        <tr>
                          <th className="px-5 py-4 font-semibold">Email</th>
                          <th className="px-5 py-4 font-semibold">Rol</th>
                          <th className="px-5 py-4 font-semibold">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {users.map((userItem) => (
                          <tr key={userItem.id} className="bg-slate-900/40">
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
                                  disabled={loading}
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
            </section>
          )}

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
            Volver al <a href="/dashboard" className="text-cyan-300">dashboard</a> o <a href="/login" className="text-cyan-300">cerrar sesion</a>.
          </div>
        </div>
      </div>
    </div>
  );
}
