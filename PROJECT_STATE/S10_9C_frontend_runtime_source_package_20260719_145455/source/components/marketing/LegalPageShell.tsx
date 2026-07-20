import Link from "next/link";
import CookieConsent from "@/components/marketing/CookieConsent";
import BrandMark from "@/components/marketing/BrandMark";

type LegalSection = {
  title: string;
  text: string;
};

const siteLinks = [
  { label: "Главная", href: "/" },
  { label: "Продукт", href: "/product" },
  { label: "Тарифы", href: "/pricing" },
  { label: "О нас", href: "/about" },
];

const legalLinks = [
  { label: "Политика конфиденциальности", href: "/legal/privacy-policy" },
  { label: "Условия использования", href: "/legal/terms" },
  { label: "Дисклеймер", href: "/legal/disclaimer" },
  { label: "Лицензионное соглашение", href: "/legal/eula" },
  { label: "Оплата и отмена", href: "/legal/billing" },
  { label: "Политика cookies", href: "/legal/cookies" },
];

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
        <div className="absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-violet-500/5 blur-3xl" />
      </div>

      <header className="relative border-b border-white/10 bg-[#070b16]/82 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-4 py-5 md:px-8">
          <Link href="/" className="flex items-center gap-3">
            <BrandMark size="sm" />

            <div>
              <div className="text-lg font-semibold tracking-tight">
                SkillEdge AI
              </div>
              <div className="text-xs uppercase tracking-[0.22em] text-white/40">
                Юридический центр
              </div>
            </div>
          </Link>

          <nav className="hidden items-center gap-2 md:flex">
            {siteLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full px-4 py-2 text-sm text-white/60 transition hover:bg-white/[0.06] hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <Link
            href="/dashboard"
            className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            Кабинет
          </Link>
        </div>
      </header>

      <section className="relative mx-auto max-w-7xl px-4 pb-16 pt-8 md:px-8 md:pt-12">
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-4 shadow-2xl shadow-black/20">
              <div className="px-2 text-xs font-semibold uppercase tracking-[0.24em] text-white/35">
                Документы
              </div>

              <div className="mt-4 space-y-1">
                {legalLinks.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="block rounded-2xl px-3 py-3 text-sm text-white/58 transition hover:bg-cyan-300/[0.07] hover:text-white"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>

              <div className="mt-5 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.045] p-4 text-xs leading-6 text-cyan-50/65">
                По вопросам доступа, оплаты, документов или работы платформы:
                <br />
                <a
                  href="mailto:support@upyourskills.site"
                  className="mt-2 inline-block font-semibold text-cyan-100 hover:text-white"
                >
                  support@upyourskills.site
                </a>
              </div>
            </div>
          </aside>

          <div className="overflow-hidden rounded-[2.75rem] border border-white/10 bg-white/[0.035] shadow-2xl shadow-black/30">
            <div className="relative border-b border-white/10 p-6 md:p-10">
              <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-500/15 blur-3xl" />
              <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-indigo-500/15 blur-3xl" />

              <div className="relative">
                <div className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100">
                  SkillEdge AI Legal
                </div>

                <h1 className="mt-6 max-w-4xl text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
                  {title}
                </h1>

                <p className="mt-5 max-w-3xl text-base leading-8 text-white/62">
                  {description}
                </p>

                <div className="mt-6 grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-7 text-white/58">
                    Эти документы описывают правила использования SkillEdge AI,
                    обработку данных, оплату, ограничения ответственности и
                    важные предупреждения о торговых рисках.
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
                    <section
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
                    </section>
                  ))}
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-[1.5rem] border border-red-300/15 bg-red-300/[0.03] p-5 text-xs leading-6 text-red-50/65">
                  SkillEdge AI не является финансовым, инвестиционным,
                  юридическим или налоговым консультантом. Торговля и
                  инвестирование связаны с риском, включая риск полной или
                  частичной потери капитала.
                </div>

                <div className="rounded-[1.5rem] border border-amber-300/15 bg-amber-300/[0.035] p-5 text-xs leading-6 text-amber-50/65">
                  Материалы платформы, AI-сигналы, отчёты, рыночные данные и
                  аналитика предоставляются в информационных и образовательных
                  целях. Пользователь самостоятельно принимает все торговые и
                  инвестиционные решения.
                </div>
              </div>

              <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6">
                <Link
                  href="/"
                  className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
                >
                  ← Вернуться на сайт
                </Link>

                <Link
                  href="/legal/disclaimer"
                  className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-5 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/15"
                >
                  Читать дисклеймер
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="relative border-t border-white/10 bg-[#050814]">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 text-sm text-white/45 md:grid-cols-[1fr_auto] md:px-8">
          <div>
            <div className="font-semibold text-white/70">SkillEdge AI</div>
            <p className="mt-2 max-w-2xl leading-7">
              Premium AI trading workspace для трейдеров, которым нужны
              структура, дисциплина, журнал, рыночная разведка и качественный
              разбор исполнения.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 md:justify-end">
            {legalLinks.map((item) => (
              <Link
                key={`footer-${item.href}`}
                href={item.href}
                className="text-white/45 transition hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>

      <CookieConsent />
    </main>
  );
}