export default function Home() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-slate-950 px-6 py-12 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.25),_transparent_55%),radial-gradient(circle_at_bottom,_rgba(236,72,153,0.2),_transparent_50%)]" />
      <main className="relative z-10 flex w-full max-w-4xl flex-col gap-10">
        <header className="flex flex-col gap-4">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">
            Coldcase Control
          </p>
          <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
            Acceso seguro para el monitoreo de cadena de frio.
          </h1>
          <p className="max-w-2xl text-lg text-slate-200">
            Gestiona usuarios, roles y tokens desde un flujo de autenticacion
            simple. Ingresa o crea tu cuenta para continuar.
          </p>
        </header>
        <section className="grid gap-6 sm:grid-cols-2">
          <a
            href="/login"
            className="group rounded-3xl border border-cyan-400/40 bg-slate-900/60 p-6 backdrop-blur transition hover:-translate-y-1 hover:border-cyan-300"
          >
            <h2 className="text-2xl font-semibold">Iniciar sesion</h2>
            <p className="mt-2 text-slate-300">
              Accede con tus credenciales y recibe tu token JWT.
            </p>
            <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-cyan-300">
              Ir al login
              <span className="transition group-hover:translate-x-1">→</span>
            </span>
          </a>
          <a
            href="/register"
            className="group rounded-3xl border border-pink-400/40 bg-slate-900/60 p-6 backdrop-blur transition hover:-translate-y-1 hover:border-pink-300"
          >
            <h2 className="text-2xl font-semibold">Crear cuenta</h2>
            <p className="mt-2 text-slate-300">
              Registra un usuario nuevo con rol Admin, Operador o Auditor.
            </p>
            <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-pink-300">
              Ir al registro
              <span className="transition group-hover:translate-x-1">→</span>
            </span>
          </a>
          <a
            href="/ia"
            className="group rounded-3xl border border-emerald-400/40 bg-slate-900/60 p-6 backdrop-blur transition hover:-translate-y-1 hover:border-emerald-300"
          >
            <h2 className="text-2xl font-semibold">Probar IA</h2>
            <p className="mt-2 text-slate-300">
              Ejecuta un analisis con ruta, temperatura y desvio OSRM desde el navegador.
            </p>
            <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-emerald-300">
              Abrir analizador
              <span className="transition group-hover:translate-x-1">→</span>
            </span>
          </a>
        </section>
      </main>
    </div>
  );
}
