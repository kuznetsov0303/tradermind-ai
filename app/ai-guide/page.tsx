"use client";

import Link from "next/link";
import { motion } from "framer-motion";

const aiModules = [
  ["AI Coach", "Разбор сделки, риска, сетапа, эмоции, ошибки и следующего шага — в формате трейдерского review."],
  ["Market Intelligence", "Поиск in-play акций и крипты: движение, объём, катализатор, активность и контекст."],
  ["AI Market Brief", "Короткий desk-бриф: почему тикер активен, какой setup формируется, где риск и что ломает идею."],
  ["AI Alerts", "Elite workflow: setup, direction, trigger, entry zone, stop/invalidation, targets, risk note и outcome tracking."],
  ["Journal Context", "AI использует сделки, скрины, ошибки, setup tags и отчёты, чтобы лучше понимать стиль трейдера."],
  ["Reports", "Сводит историю в понятный feedback: PnL, win rate, best/worst setups, слабые места и качество исполнения."],
];

const workflow = [
  ["01", "Scan", "Система ищет активные инструменты, а не заставляет листать мёртвые графики."],
  ["02", "Filter", "Отсекает слабый шум: плохой объём, поздний chase, мутный риск, слабый catalyst."],
  ["03", "Explain", "AI объясняет setup, trigger, invalidation, trap warning и контекст движения."],
  ["04", "Plan", "Трейдер получает рабочий план: зона, риск, цели, сценарий и что отменяет идею."],
  ["05", "Review", "После сделки журнал и отчёты показывают, что сработало, а что нужно убрать."],
];

const strategies = [
  "VWAP reclaim / rejection",
  "Gap and Crap",
  "Failed breakout",
  "Pullback continuation",
  "Lower high after pump",
  "Catalyst reaction",
  "Liquidity sweep",
  "Volume expansion",
];

const comparison = [
  ["Обычный AI-инструмент", "SkillEdge AI"],
  ["Отвечает на один запрос", "Работает внутри trading workflow"],
  ["Не знает твою историю", "Учитывает сделки, скрины, ошибки и setup tags"],
  ["Даёт общие советы", "Даёт context → trigger → risk → invalidation"],
  ["Не связан с рынком", "Связан с Market Intelligence, Alerts, Journal и Reports"],
];

const outcomes = [
  "быстрее понимать, почему тикер активен",
  "отличать setup от шума",
  "не входить поздно без плана",
  "видеть риск до сделки",
  "получать разбор ошибок",
  "строить личный trading desk на своих данных",
];

export default function AiGuidePage() {
  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-[#070b16] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(56,214,255,0.15),transparent_32%),radial-gradient(circle_at_86%_10%,rgba(52,211,153,0.11),transparent_30%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:70px_70px] opacity-20" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-7 md:px-8">
        <header className="mb-7 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-200/18 bg-cyan-200/[0.08] text-xs font-black shadow-[0_0_45px_rgba(34,211,238,0.14)]">
              SE
            </div>
            <div>
              <div className="text-sm font-black">SkillEdge AI</div>
              <div className="text-[10px] font-black uppercase tracking-[0.24em] text-white/36">
                AI trading guide
              </div>
            </div>
          </Link>

          <div className="flex gap-2">
            <Link
              href="/pricing"
              className="rounded-full border border-cyan-200/16 bg-cyan-200/[0.07] px-4 py-2.5 text-xs font-black text-cyan-50 transition hover:bg-cyan-200/[0.12]"
            >
              Тарифы
            </Link>
            <Link
              href="/dashboard"
              className="rounded-full bg-white px-4 py-2.5 text-xs font-black text-[#06111d] transition hover:-translate-y-0.5"
            >
              Кабинет
            </Link>
          </div>
        </header>

        <section className="relative overflow-hidden rounded-[2.6rem] border border-cyan-100/14 bg-[#071522]/88 p-5 shadow-[0_36px_150px_rgba(8,47,73,0.30)] backdrop-blur-2xl md:p-8 lg:p-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_0%,rgba(56,214,255,0.17),transparent_30%),radial-gradient(circle_at_90%_20%,rgba(52,211,153,0.12),transparent_32%)]" />

          <motion.div
            aria-hidden
            animate={{ x: ["-20%", "120%"] }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
            className="pointer-events-none absolute top-0 h-px w-1/2 bg-gradient-to-r from-transparent via-cyan-100/55 to-transparent"
          />

          <div className="relative grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div>
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-flex rounded-full border border-cyan-200/18 bg-cyan-200/[0.07] px-4 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-cyan-50/76"
              >
                AI Trading Desk
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.55 }}
                className="mt-6 max-w-4xl text-5xl font-black leading-[0.9] tracking-[-0.075em] md:text-6xl xl:text-7xl"
              >
                Не простая AI-форма. Продукт, созданный под трейдинг.
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.18, duration: 0.5 }}
                className="mt-6 max-w-2xl text-base font-semibold leading-7 text-white/64"
              >
                SkillEdge AI связывает рынок, сигналы, журнал, скриншоты, отчёты и AI-разбор в один execution workflow. Клиент платит не за ответ на вопрос, а за систему, которая помогает видеть контекст, риск, setup и качество исполнения.
              </motion.p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/pricing"
                  className="group relative overflow-hidden rounded-full bg-white px-6 py-3 text-sm font-black text-[#06111d] transition hover:-translate-y-0.5"
                >
                  <span className="absolute -left-20 top-0 h-full w-16 rotate-12 bg-white/70 blur-md transition duration-700 group-hover:left-[120%]" />
                  <span className="relative">Выбрать доступ →</span>
                </Link>

                <Link
                  href="/desk"
                  className="rounded-full border border-cyan-200/20 bg-cyan-200/[0.07] px-6 py-3 text-sm font-black text-cyan-50 transition hover:bg-cyan-200/[0.12]"
                >
                  Открыть Trading Desk ↗
                </Link>
              </div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.22, duration: 0.6 }}
              className="relative overflow-hidden rounded-[2.2rem] border border-cyan-200/14 bg-[#081827]/82 p-4 shadow-[0_30px_110px_rgba(34,211,238,0.14)]"
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(56,214,255,0.14),transparent_34%),radial-gradient(circle_at_90%_20%,rgba(52,211,153,0.10),transparent_32%)]" />

              <div className="relative">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.22em] text-white/38">
                      Live AI workflow
                    </div>
                    <h2 className="mt-1 text-2xl font-black">Market Brief</h2>
                  </div>

                  <div className="rounded-full border border-emerald-200/18 bg-emerald-200/[0.08] px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-100/76">
                    Desk mode
                  </div>
                </div>

                <div className="mt-5 grid gap-3">
                  {[
                    ["Context", "High relative volume + catalyst"],
                    ["Setup", "VWAP reclaim / failed breakdown"],
                    ["Risk", "Invalidation under key level"],
                    ["Plan", "Trigger → entry zone → targets"],
                    ["Review", "Outcome connected to journal"],
                  ].map((row) => (
                    <div
                      key={row[0]}
                      className="rounded-2xl border border-white/10 bg-white/[0.04] p-3"
                    >
                      <div className="text-[9px] font-black uppercase tracking-[0.2em] text-white/34">
                        {row[0]}
                      </div>
                      <div className="mt-1 text-xs font-black text-white/78">{row[1]}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-2xl border border-cyan-200/12 bg-cyan-200/[0.055] p-3 text-xs font-semibold leading-5 text-cyan-50/64">
                  Цель — не слепой сигнал, а понятный trading plan: context, trigger, risk, scenario и review.
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <section className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {aiModules.map((module, index) => (
            <motion.div
              key={module[0]}
              initial={{ opacity: 0, y: 22 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ delay: index * 0.05, duration: 0.38 }}
              whileHover={{ y: -5, scale: 1.01 }}
              className="group relative overflow-hidden rounded-[1.7rem] border border-white/10 bg-white/[0.04] p-5 transition hover:border-cyan-200/24 hover:bg-cyan-200/[0.065]"
            >
              <div className="absolute -right-12 -top-12 h-28 w-28 rounded-full bg-cyan-300/0 blur-3xl transition group-hover:bg-cyan-300/12" />
              <div className="relative">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-200/15 bg-cyan-200/[0.08] text-xs font-black text-cyan-50">
                  0{index + 1}
                </div>
                <h3 className="mt-4 text-lg font-black">{module[0]}</h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-white/54">
                  {module[1]}
                </p>
              </div>
            </motion.div>
          ))}
        </section>

        <section className="mt-7 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
          <div className="relative overflow-hidden rounded-[2.4rem] border border-cyan-200/12 bg-[#081522]/82 p-5 shadow-[0_28px_120px_rgba(8,47,73,0.22)] backdrop-blur-xl md:p-7">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_0%,rgba(34,211,238,0.13),transparent_32%)]" />
            <div className="relative">
              <div className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-100/56">
                Desk workflow
              </div>
              <h2 className="mt-4 text-3xl font-black tracking-[-0.04em] md:text-4xl">
                Как AI превращает рынок в план
              </h2>

              <div className="mt-5 grid gap-2">
                {workflow.map((step, index) => (
                  <motion.div
                    key={step[0]}
                    initial={{ opacity: 0, x: 18 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.04, duration: 0.35 }}
                    className="grid gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3 md:grid-cols-[72px_120px_1fr]"
                  >
                    <div className="text-sm font-black text-cyan-100/64">{step[0]}</div>
                    <div className="text-sm font-black text-white">{step[1]}</div>
                    <div className="text-sm font-semibold leading-6 text-white/52">{step[2]}</div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[2.4rem] border border-emerald-200/12 bg-white/[0.035] p-5 shadow-[0_28px_120px_rgba(16,185,129,0.10)] backdrop-blur-xl md:p-7">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(52,211,153,0.13),transparent_34%)]" />
            <div className="relative">
              <div className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-100/56">
                Setup library
              </div>
              <h2 className="mt-4 text-3xl font-black tracking-[-0.04em] md:text-4xl">
                Не “магия”. Логика сетапов и риска.
              </h2>

              <div className="mt-5 flex flex-wrap gap-2">
                {strategies.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-white/10 bg-black/18 px-3 py-2 text-xs font-black text-white/62"
                  >
                    {item}
                  </span>
                ))}
              </div>

              <p className="mt-5 rounded-2xl border border-emerald-200/14 bg-emerald-200/[0.055] p-4 text-sm font-semibold leading-7 text-emerald-50/68">
                SkillEdge AI должен помогать трейдеру понимать механику сделки: почему ситуация in-play, где подтверждение, где ловушка и где идея становится недействительной.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-7 relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-white/[0.035] p-5 shadow-[0_28px_120px_rgba(0,0,0,0.20)] backdrop-blur-xl md:p-7">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(56,214,255,0.12),transparent_38%)]" />
          <div className="relative grid gap-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.24em] text-white/38">
                Why paid
              </div>
              <h2 className="mt-4 text-3xl font-black tracking-[-0.04em] md:text-4xl">
                Почему это не заменить бесплатным инструментом
              </h2>
              <p className="mt-4 max-w-xl text-sm font-semibold leading-7 text-white/56">
                Бесплатный инструмент не знает твою историю сделок, не связан с market scanner, не помнит твои setup tags, не строит отчёты по исполнению и не соединяет signals ↔ journal ↔ review.
              </p>
            </div>

            <div className="grid gap-2">
              {comparison.map((row, index) => (
                <motion.div
                  key={`${row[0]}-${row[1]}`}
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.04, duration: 0.35 }}
                  className={`grid gap-2 rounded-2xl border p-3 md:grid-cols-2 ${
                    index === 0
                      ? "border-cyan-200/18 bg-cyan-200/[0.075] text-sm font-black text-cyan-50"
                      : "border-white/10 bg-white/[0.035] text-sm font-semibold text-white/58"
                  }`}
                >
                  <div>{row[0]}</div>
                  <div>{row[1]}</div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-7 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="relative overflow-hidden rounded-[2.4rem] border border-cyan-200/12 bg-[#081522]/82 p-5 shadow-[0_28px_120px_rgba(8,47,73,0.22)] backdrop-blur-xl md:p-7">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_0%,rgba(34,211,238,0.13),transparent_32%)]" />
            <div className="relative">
              <div className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-100/56">
                Outcome
              </div>
              <h2 className="mt-4 text-3xl font-black tracking-[-0.04em] md:text-4xl">
                Что получает трейдер
              </h2>

              <div className="mt-5 grid gap-2">
                {outcomes.map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-white/10 bg-black/18 px-4 py-3 text-sm font-bold leading-6 text-white/66"
                  >
                    <span className="mr-2 text-cyan-200">✓</span>
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[2.4rem] border border-emerald-200/12 bg-[#071522]/86 p-5 shadow-[0_28px_120px_rgba(16,185,129,0.10)] backdrop-blur-xl md:p-7">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_0%,rgba(52,211,153,0.13),transparent_34%)]" />
            <div className="relative">
              <div className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-100/56">
                Built by specialists
              </div>
              <h2 className="mt-4 text-3xl font-black tracking-[-0.04em] md:text-4xl">
                Создано с нуля под трейдинг, а не адаптировано “на коленке”.
              </h2>
              <p className="mt-4 text-sm font-semibold leading-7 text-white/56">
                SkillEdge AI проектируется как полноценный SaaS-продукт на стыке AI engineering, software development, trading workflow, market intelligence и risk-first логики. Это отдельная система вокруг трейдера: от поиска идеи до review после сделки.
              </p>
              <p className="mt-4 rounded-2xl border border-amber-200/14 bg-amber-200/[0.055] p-4 text-xs font-semibold leading-6 text-amber-50/68">
                SkillEdge AI не обещает прибыль и не заменяет риск-менеджмент. Его задача — дать структуру, контекст, дисциплину и качественный разбор.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-7 overflow-hidden rounded-[2.5rem] border border-cyan-200/12 bg-[#071522]/86 p-6 text-center shadow-[0_28px_120px_rgba(8,47,73,0.22)] md:p-9">
          <h2 className="text-3xl font-black tracking-[-0.04em] md:text-5xl">
            Сильная торговля начинается с процесса. AI должен усиливать именно его.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm font-semibold leading-7 text-white/56">
            Сканируй рынок, получай context, фиксируй сделки, разбирай ошибки и превращай историю в данные для роста.
          </p>

          <Link
            href="/pricing"
            className="mt-7 inline-flex rounded-full bg-white px-7 py-3.5 text-sm font-black text-[#06111d] transition hover:-translate-y-0.5"
          >
            Выбрать доступ →
          </Link>
        </section>

        <AiGuideFooter />
      </div>
    </main>
  );
}

function AiGuideFooter() {
  return (
    <footer className="mt-10 border-t border-white/10 pb-4 pt-8">
      <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]">
        <div>
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-200/18 bg-cyan-200/[0.08] text-xs font-black text-white">
              SE
            </div>

            <div>
              <div className="text-sm font-black text-white">SkillEdge AI</div>
              <div className="text-[10px] font-black uppercase tracking-[0.24em] text-white/36">
                AI Trading Desk
              </div>
            </div>
          </Link>

          <p className="mt-4 max-w-md text-sm font-semibold leading-7 text-white/48">
            Market intelligence, AI review, alerts, reports and journal context in one trading workflow.
          </p>
        </div>

        <div>
          <h4 className="text-xs font-black uppercase tracking-[0.24em] text-white/34">
            Продукт
          </h4>
          <div className="mt-4 space-y-2">
            <Link href="/" className="block text-sm font-semibold text-white/48 hover:text-cyan-100">Главная</Link>
            <Link href="/desk" className="block text-sm font-semibold text-white/48 hover:text-cyan-100">AI Trading Desk</Link>
            <Link href="/product" className="block text-sm font-semibold text-white/48 hover:text-cyan-100">Продукт</Link>
            <Link href="/pricing" className="block text-sm font-semibold text-white/48 hover:text-cyan-100">Тарифы</Link>
          </div>
        </div>

        <div>
          <h4 className="text-xs font-black uppercase tracking-[0.24em] text-white/34">
            Гайды
          </h4>
          <div className="mt-4 space-y-2">
            <Link href="/journal-guide" className="block text-sm font-semibold text-white/48 hover:text-cyan-100">Гайд по журналу</Link>
            <Link href="/ai-guide" className="block text-sm font-semibold text-cyan-100">Гайд по AI</Link>
            <Link href="/dashboard" className="block text-sm font-semibold text-white/48 hover:text-cyan-100">Кабинет</Link>
          </div>
        </div>

        <div>
          <h4 className="text-xs font-black uppercase tracking-[0.24em] text-white/34">
            Контакты
          </h4>
          <div className="mt-4 space-y-2 text-sm font-semibold text-white/48">
            <p>support@upyourskills.site</p>
            <p>Dubai / Warsaw / Kyiv</p>
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-3 border-t border-white/10 pt-5 text-xs font-semibold text-white/34 md:flex-row md:items-center md:justify-between">
        <p>© 2026 SkillEdge AI. Все права защищены.</p>
        <p>Context. Risk. Execution. Review.</p>
      </div>
    </footer>
  );
}

