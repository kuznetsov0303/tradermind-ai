import Link from "next/link";
import CookieConsent from "@/components/marketing/CookieConsent";

type LegalSection = {
  title: string;
  text: string;
};

export default function LegalPageShell({
  title,
  description,
  updatedAt,
  sections,
}: {
  title: string;
  description: string;
  updatedAt: string;
  sections: LegalSection[];
}) {
  return (
    <main className="min-h-screen bg-[#070b16] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -right-40 top-20 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute -left-40 bottom-20 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl" />
      </div>

      <header className="relative mx-auto flex max-w-7xl items-center justify-between px-4 py-6 md:px-8">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-xl">
            ✦
          </div>

          <div>
            <div className="text-lg font-semibold">SkillEdge AI</div>
            <div className="text-xs uppercase tracking-[0.22em] text-white/40">
              Юридический центр
            </div>
          </div>
        </Link>

        <nav className="hidden items-center gap-2 md:flex">
          {[
            ["Главная", "/"],
            ["Продукт", "/product"],
            ["Тарифы", "/pricing"],
            ["Команда", "/team"],
          ].map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="rounded-full px-4 py-2 text-sm text-white/60 transition hover:bg-white/[0.06] hover:text-white"
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>

      <section className="relative mx-auto max-w-6xl px-4 pb-20 pt-8 md:px-8">
        <div className="overflow-hidden rounded-[2.75rem] border border-white/10 bg-white/[0.035] shadow-2xl shadow-black/30">
          <div className="relative border-b border-white/10 p-6 md:p-10">
            <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-500/15 blur-3xl" />
            <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-indigo-500/15 blur-3xl" />

            <div className="relative">
              <div className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100">
                Черновик для проверки юристом
              </div>

              <h1 className="mt-6 max-w-4xl text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
                {title}
              </h1>

              <p className="mt-5 max-w-3xl text-base leading-8 text-white/62">
                {description}
              </p>

              <div className="mt-6 grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
                <div className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.035] p-4 text-sm leading-7 text-amber-50/70">
                  Документ подготовлен как рабочий черновик. Перед публикацией
                  его нужно проверить с юристом под юрисдикцию компании,
                  модель оплаты, AI-провайдеров, market data providers и
                  фактическую архитектуру продукта.
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/45">
                  Обновлено: {updatedAt}
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 md:p-10">
            <div className="rounded-[2rem] border border-white/10 bg-black/20 p-5 md:p-7">
              <div className="text-xs uppercase tracking-[0.24em] text-white/35">
                Основные положения
              </div>

              <div className="mt-6 space-y-7">
                {sections.map((section, index) => (
                  <div
                    key={`${section.title}-${index}`}
                    className="border-b border-white/10 pb-6 last:border-b-0 last:pb-0"
                  >
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-300/10 text-xs font-semibold text-cyan-100">
                        {index + 1}
                      </div>

                      <div className="min-w-0 flex-1">
                        <h2 className="text-xl font-semibold text-white">
                          {section.title}
                        </h2>

                        <p className="mt-3 whitespace-pre-line text-sm leading-8 text-white/62">
                          {section.text}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 rounded-[1.5rem] border border-red-300/15 bg-red-300/[0.03] p-5 text-xs leading-6 text-red-50/65">
              SkillEdge AI не является финансовым, инвестиционным,
              юридическим или налоговым советником. Торговля и инвестирование
              связаны с риском, включая риск полной или частичной потери
              капитала. Любые материалы, AI-ответы, сигналы, отчеты и
              аналитика предоставляются исключительно в информационных и
              образовательных целях.
            </div>
          </div>
        </div>
      </section>
      <CookieConsent />
    </main>
  );
}