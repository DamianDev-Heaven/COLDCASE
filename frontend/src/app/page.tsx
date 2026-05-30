export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-black px-5 py-5 text-white sm:px-8 lg:px-10">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:72px_72px] opacity-[0.08]" />

      <main className="relative z-10 mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-[1120px] flex-col">
        <header className="flex items-center justify-between border-b border-white/18 pb-2 pt-2 animate-fade-up">
          <div className="flex items-end gap-2">
            <span className="text-[26px] font-black tracking-[-0.04em] leading-none sm:text-[31px]">
              COLDCASE
            </span>
            <span className="pb-0.5 text-[11px] font-medium uppercase tracking-[0.22em] text-white/72 sm:text-sm">
              Control
            </span>
          </div>

          <nav className="hidden items-center gap-10 text-sm font-semibold uppercase tracking-[0.18em] text-white/88 md:flex">
            <a className="transition hover:text-cyan-300" href="/login">
              Iniciar sesion
            </a>
            <a className="transition hover:text-cyan-300" href="/ia">
              Probar IA
            </a>
          </nav>
        </header>

        <section className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1fr_1.22fr] lg:gap-14 lg:py-14">
          <div className="max-w-xl animate-fade-up animation-delay-150">
            <p className="mb-7 text-xs font-semibold uppercase tracking-[0.38em] text-white/38">
              Monitoreo logístico en tiempo real
            </p>

            <h1 className="max-w-[11ch] text-5xl font-black uppercase leading-[0.92] tracking-[-0.06em] sm:text-6xl lg:text-[72px]">
              Monitoreo y trazabilidad
            </h1>

            <p className="mt-4 max-w-[28rem] text-lg font-medium text-white/40 sm:text-[21px]">
              Asegura la cadena de frío con visibilidad completa de temperatura, viajes,
              incidentes y decisiones asistidas por IA.
            </p>

            <div className="mt-9 flex flex-wrap gap-4">
              <a
                href="/login"
                className="inline-flex min-w-[150px] items-center justify-center rounded-md border border-white/38 bg-black px-6 py-2.5 text-sm font-semibold uppercase tracking-[0.15em] text-white transition duration-300 hover:-translate-y-0.5 hover:border-white/58 hover:bg-white/6"
              >
                Iniciar sesion
              </a>
              <a
                href="/ia"
                className="inline-flex min-w-[118px] items-center justify-center rounded-md border border-white/38 bg-black px-6 py-2.5 text-sm font-semibold uppercase tracking-[0.15em] text-white transition duration-300 hover:-translate-y-0.5 hover:border-white/58 hover:bg-white/6"
              >
                Probar IA
              </a>
            </div>

            <div className="mt-10 grid max-w-[30rem] grid-cols-3 gap-3 text-xs uppercase tracking-[0.18em] text-white/48 animate-fade-up animation-delay-300">
              <div className="rounded-2xl border border-white/10 bg-white/3 px-4 py-3">
                Trazabilidad
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/3 px-4 py-3">
                Analítica IA
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/3 px-4 py-3">
                Alta segura
              </div>
            </div>
          </div>

          <div className="grid gap-5 animate-fade-up animation-delay-300">
            <div className="grid gap-5 lg:grid-cols-2">
              <article className="min-h-[280px] rounded-[14px] border border-white/32 bg-[#070707] p-5 transition duration-300 hover:-translate-y-1 hover:border-white/48 hover:bg-[#090909]">
                <p className="text-[17px] font-black uppercase tracking-[-0.03em]">
                  Funcionalidades
                </p>
                <div className="mt-10 space-y-4 text-sm text-white/72">
                  <div className="rounded-2xl border border-white/8 bg-black/70 p-4 transition hover:border-white/16 hover:bg-white/4">
                    <p className="font-semibold text-white">Monitoreo continuo</p>
                    <p className="mt-1 text-white/62">
                      Seguimiento de temperatura, eventos y estado operativo durante cada traslado.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-black/70 p-4 transition hover:border-white/16 hover:bg-white/4">
                    <p className="font-semibold text-white">Alertas por incidente</p>
                    <p className="mt-1 text-white/62">
                      Detección temprana ante desvíos, aperturas y cortes de ruta.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-black/70 p-4 transition hover:border-white/16 hover:bg-white/4">
                    <p className="font-semibold text-white">Control administrativo</p>
                    <p className="mt-1 text-white/62">
                      Gestión de usuarios, sucursales, transporte y accesos con trazabilidad completa.
                    </p>
                  </div>
                </div>
              </article>

              <article className="min-h-[280px] rounded-[14px] border border-white/32 bg-[#070707] p-5 transition duration-300 hover:-translate-y-1 hover:border-white/48 hover:bg-[#090909]">
                <p className="text-[17px] font-black uppercase tracking-[-0.03em]">IA</p>
                <div className="mt-9 space-y-4 text-sm text-white/72">
                  <div className="rounded-2xl border border-white/8 bg-black/70 p-4">
                    <p className="font-semibold text-white">Análisis contextual</p>
                    <p className="mt-1 text-white/62">
                      La IA interpreta el recorrido, las mediciones y los desvíos para resumir el estado de cada viaje.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-black/70 p-4">
                    <p className="font-semibold text-white">Decisiones rápidas</p>
                    <p className="mt-1 text-white/62">
                      Prioriza incidentes críticos y sugiere acciones cuando la ruta o la temperatura se salen de rango.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/48">
                    <span className="rounded-full border border-white/12 bg-black px-3 py-1">Riesgo</span>
                    <span className="rounded-full border border-white/12 bg-black px-3 py-1">Ruta</span>
                    <span className="rounded-full border border-white/12 bg-black px-3 py-1">Temperatura</span>
                  </div>
                </div>
              </article>
            </div>

            <article className="min-h-[126px] rounded-[14px] border border-white/32 bg-[#070707] p-5 transition duration-300 hover:-translate-y-1 hover:border-white/48 hover:bg-[#090909] animation-delay-450">
              <p className="text-[17px] font-black uppercase tracking-[-0.03em]">
                Alta administrativa
              </p>
              <div className="mt-3 max-w-[46rem] text-sm leading-6 text-white/66 sm:text-[15px]">
                El alta de usuarios, centros de distribución, sucursales y transportes se administra desde el panel privado.
                El acceso público permanece limitado a login y consulta segura, manteniendo separadas las tareas operativas de las de administración.
              </div>
            </article>
          </div>
        </section>
      </main>
    </div>
  );
}
