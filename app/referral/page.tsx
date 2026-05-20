"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

type Language = "en" | "ru" | "ua";

const copy = {
  ru: {
    langLabel: "RU",
    headerTag: "Реферальная программа",
    pricing: "Тарифы",
    dashboard: "Кабинет",
    eyebrow: "SkillEdge partner rewards",
    heroTitle:
      "Приводи трейдеров. Получай reward с каждой серьёзной подписки.",
    heroText:
      "SkillEdge AI создан для трейдеров, которым нужна структура, разбор и более чистый процесс. Если ты знаешь людей, которым нужен журнал, AI-разбор, market intelligence и сигналы — приглашай их и получай баллы за реальные оплаты.",
    primary: "Открыть кабинет",
    secondary: "Смотреть тарифы",
    rewardModel: "Reward model",
    firstPayment: "от первой оплаты приглашённого клиента",
    repeatPayment: "с каждого повторного платежа",
    withdraw: "баллов для вывода",
    pointNote:
      "1 балл = $1. Баллы начисляются после подтверждённой оплаты приглашённого клиента.",
    steps: [
      ["01", "Пригласи трейдера", "Дай другу referral-ссылку или попроси его указать твой код при оплате."],
      ["02", "Друг покупает доступ", "Когда приглашённый клиент оплачивает любой тариф, система фиксирует referral."],
      ["03", "Ты получаешь 15%", "С первой оплаты тебе начисляется 15% баллами. 1 балл = $1."],
      ["04", "Получай 5% дальше", "Если клиент продлевает подписку или платит повторно, ты получаешь 5% с каждого следующего платежа."],
    ],
    whyEyebrow: "Why it works",
    whyTitle: "Это не разовый бонус. Это reward за активную аудиторию.",
    whyText:
      "Если приглашённый трейдер продолжает пользоваться SkillEdge AI и продлевает доступ, ты продолжаешь получать 5% с повторных платежей. Чем качественнее аудитория, тем сильнее долгосрочный результат.",
    termsEyebrow: "Terms",
    benefits: [
      "15% с первой оплаты приглашённого клиента",
      "5% с каждого повторного платежа / продления",
      "1 балл = $1",
      "вывод доступен от 75+ баллов",
      "подходит трейдерам, комьюнити, наставникам и блогерам",
      "прозрачная модель: чем больше активных клиентов — тем больше reward",
    ],
    finalTitle: "Приводи тех, кому реально нужен trading process.",
    finalText:
      "SkillEdge AI лучше всего заходит трейдерам, которые хотят вести журнал, разбирать ошибки, получать market intelligence и строить дисциплину.",
    finalButton: "Перейти в кабинет",
    footerRights: "© 2026 SkillEdge AI. Все права защищены.",
    footerNote: "Referral rewards начисляются после подтверждённых успешных платежей.",
  },
  ua: {
    langLabel: "UA",
    headerTag: "Партнерська програма",
    pricing: "Тарифи",
    dashboard: "Кабінет",
    eyebrow: "SkillEdge partner rewards",
    heroTitle:
      "Запрошуй трейдерів. Отримуй reward з кожної серйозної підписки.",
    heroText:
      "SkillEdge AI створений для трейдерів, яким потрібні структура, розбір і чистіший процес. Якщо ти знаєш людей, яким потрібен журнал, AI-розбір, market intelligence і сигнали — запрошуй їх та отримуй бали за реальні оплати.",
    primary: "Відкрити кабінет",
    secondary: "Переглянути тарифи",
    rewardModel: "Reward model",
    firstPayment: "від першої оплати запрошеного клієнта",
    repeatPayment: "з кожного повторного платежу",
    withdraw: "балів для виводу",
    pointNote:
      "1 бал = $1. Бали нараховуються після підтвердженої оплати запрошеного клієнта.",
    steps: [
      ["01", "Запроси трейдера", "Дай другу referral-посилання або попроси його вказати твій код під час оплати."],
      ["02", "Друг купує доступ", "Коли запрошений клієнт оплачує будь-який тариф, система фіксує referral."],
      ["03", "Ти отримуєш 15%", "З першої оплати тобі нараховується 15% балами. 1 бал = $1."],
      ["04", "Отримуй 5% далі", "Якщо клієнт продовжує підписку або платить повторно, ти отримуєш 5% з кожного наступного платежу."],
    ],
    whyEyebrow: "Why it works",
    whyTitle: "Це не разовий бонус. Це reward за активну аудиторію.",
    whyText:
      "Якщо запрошений трейдер продовжує користуватися SkillEdge AI і продовжує доступ, ти далі отримуєш 5% з повторних платежів. Чим якісніша аудиторія, тим сильніший довгостроковий результат.",
    termsEyebrow: "Terms",
    benefits: [
      "15% з першої оплати запрошеного клієнта",
      "5% з кожного повторного платежу / продовження",
      "1 бал = $1",
      "вивід доступний від 75+ балів",
      "підходить трейдерам, ком’юніті, наставникам і блогерам",
      "прозора модель: чим більше активних клієнтів — тим більший reward",
    ],
    finalTitle: "Запрошуй тих, кому реально потрібен trading process.",
    finalText:
      "SkillEdge AI найкраще підходить трейдерам, які хочуть вести журнал, розбирати помилки, отримувати market intelligence і будувати дисципліну.",
    finalButton: "Перейти в кабінет",
    footerRights: "© 2026 SkillEdge AI. Усі права захищені.",
    footerNote: "Referral rewards нараховуються після підтверджених успішних платежів.",
  },
  en: {
    langLabel: "EN",
    headerTag: "Referral program",
    pricing: "Pricing",
    dashboard: "Dashboard",
    eyebrow: "SkillEdge partner rewards",
    heroTitle:
      "Invite traders. Earn rewards from every serious subscription.",
    heroText:
      "SkillEdge AI is built for traders who need structure, review and a cleaner process. If you know people who need a trading journal, AI review, market intelligence and alerts — invite them and earn points from confirmed payments.",
    primary: "Open dashboard",
    secondary: "View pricing",
    rewardModel: "Reward model",
    firstPayment: "from the first payment of an invited customer",
    repeatPayment: "from every repeat payment",
    withdraw: "points required for payout",
    pointNote:
      "1 point = $1. Points are credited after the invited customer’s payment is confirmed.",
    steps: [
      ["01", "Invite a trader", "Share your referral link or ask the trader to enter your code during checkout."],
      ["02", "They buy access", "When the invited customer buys any plan, the system records the referral."],
      ["03", "You earn 15%", "You receive 15% from the first payment in points. 1 point = $1."],
      ["04", "Keep earning 5%", "If the customer renews or pays again, you receive 5% from every next payment."],
    ],
    whyEyebrow: "Why it works",
    whyTitle: "This is not a one-time bonus. It is a reward for an active audience.",
    whyText:
      "If the invited trader keeps using SkillEdge AI and renews access, you continue earning 5% from repeat payments. The stronger the audience quality, the stronger the long-term reward.",
    termsEyebrow: "Terms",
    benefits: [
      "15% from the invited customer’s first payment",
      "5% from every repeat payment / renewal",
      "1 point = $1",
      "payout is available from 75+ points",
      "built for traders, communities, mentors and creators",
      "transparent model: more active customers means more reward",
    ],
    finalTitle: "Invite people who need a real trading process.",
    finalText:
      "SkillEdge AI fits traders who want to keep a journal, review mistakes, use market intelligence and build discipline.",
    finalButton: "Go to dashboard",
    footerRights: "© 2026 SkillEdge AI. All rights reserved.",
    footerNote: "Referral rewards are credited after confirmed successful payments.",
  },
} as const;

function getSavedLanguage(): Language {
  if (typeof window === "undefined") return "ru";

  const saved = localStorage.getItem("skilledge_language");
  if (saved === "en" || saved === "ru" || saved === "ua") return saved;

  const htmlLang = document.documentElement.lang;
  if (htmlLang === "en" || htmlLang === "ru" || htmlLang === "ua") return htmlLang;

  return "ru";
}

function getNextLanguage(language: Language): Language {
  return language === "en" ? "ru" : language === "ru" ? "ua" : "en";
}

export default function ReferralPage() {
  const [language, setLanguage] = useState<Language>("ru");
  const t = copy[language];

  useEffect(() => {
    setLanguage(getSavedLanguage());

    const handleLanguageChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ language?: Language }>).detail;

      if (
        detail?.language === "en" ||
        detail?.language === "ru" ||
        detail?.language === "ua"
      ) {
        setLanguage(detail.language);
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (
        event.key === "skilledge_language" &&
        (event.newValue === "en" ||
          event.newValue === "ru" ||
          event.newValue === "ua")
      ) {
        setLanguage(event.newValue);
      }
    };

    window.addEventListener("skilledge:language-changed", handleLanguageChanged);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("skilledge:language-changed", handleLanguageChanged);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const cycleLanguage = () => {
    const next = getNextLanguage(language);
    setLanguage(next);
    localStorage.setItem("skilledge_language", next);

    window.dispatchEvent(
      new CustomEvent("skilledge:language-changed", {
        detail: { language: next },
      }),
    );
  };

  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-[#070b16] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(56,214,255,0.16),transparent_32%),radial-gradient(circle_at_88%_16%,rgba(52,211,153,0.12),transparent_30%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:70px_70px] opacity-20" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-7 md:px-8">
        <header className="mb-7 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-200/18 bg-cyan-200/[0.08] text-xs font-black">
              SE
            </div>
            <div>
              <div className="text-sm font-black">SkillEdge AI</div>
              <div className="text-[10px] font-black uppercase tracking-[0.24em] text-white/36">
                {t.headerTag}
              </div>
            </div>
          </Link>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={cycleLanguage}
              className="rounded-full border border-white/10 bg-white/[0.045] px-4 py-2.5 text-xs font-black text-white/70 transition hover:bg-white/[0.08] hover:text-white"
            >
              {t.langLabel}
            </button>

            <Link
              href="/pricing"
              className="rounded-full border border-cyan-200/16 bg-cyan-200/[0.07] px-4 py-2.5 text-xs font-black text-cyan-50 transition hover:bg-cyan-200/[0.12]"
            >
              {t.pricing}
            </Link>

            <Link
              href="/dashboard"
              className="rounded-full bg-white px-4 py-2.5 text-xs font-black text-[#06111d] transition hover:-translate-y-0.5"
            >
              {t.dashboard}
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
                {t.eyebrow}
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.55 }}
                className="mt-6 max-w-4xl text-5xl font-black leading-[0.9] tracking-[-0.075em] md:text-6xl xl:text-7xl"
              >
                {t.heroTitle}
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.18, duration: 0.5 }}
                className="mt-6 max-w-2xl text-base font-semibold leading-7 text-white/64"
              >
                {t.heroText}
              </motion.p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/dashboard"
                  className="group relative overflow-hidden rounded-full bg-white px-6 py-3 text-sm font-black text-[#06111d] transition hover:-translate-y-0.5"
                >
                  <span className="absolute -left-20 top-0 h-full w-16 rotate-12 bg-white/70 blur-md transition duration-700 group-hover:left-[120%]" />
                  <span className="relative">{t.primary} →</span>
                </Link>

                <Link
                  href="/pricing"
                  className="rounded-full border border-cyan-200/20 bg-cyan-200/[0.07] px-6 py-3 text-sm font-black text-cyan-50 transition hover:bg-cyan-200/[0.12]"
                >
                  {t.secondary} ↗
                </Link>
              </div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.22, duration: 0.6 }}
              className="relative overflow-hidden rounded-[2.2rem] border border-emerald-200/16 bg-[#081827]/82 p-5 shadow-[0_30px_110px_rgba(52,211,153,0.12)]"
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(52,211,153,0.15),transparent_34%),radial-gradient(circle_at_90%_20%,rgba(56,214,255,0.10),transparent_32%)]" />

              <div className="relative">
                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-100/60">
                  {t.rewardModel}
                </div>

                <div className="mt-5 grid gap-3">
                  <div className="rounded-[1.6rem] border border-emerald-200/16 bg-emerald-200/[0.075] p-5">
                    <div className="text-5xl font-black text-white">15%</div>
                    <div className="mt-2 text-sm font-bold leading-6 text-white/62">
                      {t.firstPayment}
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-[1.4rem] border border-cyan-200/12 bg-cyan-200/[0.06] p-4">
                      <div className="text-3xl font-black text-white">5%</div>
                      <div className="mt-1 text-xs font-bold leading-5 text-white/56">
                        {t.repeatPayment}
                      </div>
                    </div>

                    <div className="rounded-[1.4rem] border border-white/10 bg-white/[0.04] p-4">
                      <div className="text-3xl font-black text-white">75+</div>
                      <div className="mt-1 text-xs font-bold leading-5 text-white/56">
                        {t.withdraw}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-xs font-semibold leading-5 text-white/50">
                    {t.pointNote}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <section className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {t.steps.map((step, index) => (
            <motion.div
              key={step[0]}
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
                  {step[0]}
                </div>
                <h3 className="mt-4 text-lg font-black">{step[1]}</h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-white/54">
                  {step[2]}
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
                {t.whyEyebrow}
              </div>
              <h2 className="mt-4 text-3xl font-black tracking-[-0.04em] md:text-4xl">
                {t.whyTitle}
              </h2>
              <p className="mt-4 text-sm font-semibold leading-7 text-white/56">
                {t.whyText}
              </p>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[2.4rem] border border-emerald-200/12 bg-white/[0.035] p-5 shadow-[0_28px_120px_rgba(16,185,129,0.10)] backdrop-blur-xl md:p-7">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(52,211,153,0.13),transparent_34%)]" />
            <div className="relative">
              <div className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-100/56">
                {t.termsEyebrow}
              </div>
              <div className="mt-5 grid gap-2">
                {t.benefits.map((item) => (
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
        </section>

        <section className="mt-7 overflow-hidden rounded-[2.5rem] border border-cyan-200/12 bg-[#071522]/86 p-6 text-center shadow-[0_28px_120px_rgba(8,47,73,0.22)] md:p-9">
          <h2 className="text-3xl font-black tracking-[-0.04em] md:text-5xl">
            {t.finalTitle}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm font-semibold leading-7 text-white/56">
            {t.finalText}
          </p>

          <Link
            href="/dashboard"
            className="mt-7 inline-flex rounded-full bg-white px-7 py-3.5 text-sm font-black text-[#06111d] transition hover:-translate-y-0.5"
          >
            {t.finalButton} →
          </Link>
        </section>

        <footer className="mt-10 border-t border-white/10 pb-4 pt-8">
          <div className="flex flex-col gap-3 text-xs font-semibold text-white/34 md:flex-row md:items-center md:justify-between">
            <p>{t.footerRights}</p>
            <p>{t.footerNote}</p>
          </div>
        </footer>
      </div>
    </main>
  );
}

