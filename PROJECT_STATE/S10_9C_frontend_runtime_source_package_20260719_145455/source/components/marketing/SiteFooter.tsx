"use client";

import Link from "next/link";
import BrandMark from "@/components/marketing/BrandMark";

type SiteFooterLanguage = "en" | "ru" | "ua";

type SiteFooterProps = {
  language?: string;
  className?: string;
  onChoosePlan?: () => void;
};

function normalizeFooterLanguage(language?: string): SiteFooterLanguage {
  if (language === "ru" || language === "ua" || language === "en") return language;
  return "ru";
}

const FOOTER_COPY: Record<
  SiteFooterLanguage,
  {
    brandTag: string;
    description: string;
    choosePlan: string;
    dashboardGuide: string;
    disclaimer: string;
    productColumn: string;
    resourcesColumn: string;
    documentsColumn: string;
    contacts: string;
    location: string;
    demo: string;
    rights: string;
    bottomNote: string;
    productLinks: { label: string; href: string }[];
    resourceLinks: { label: string; href: string }[];
    documentLinks: { label: string; href: string }[];
  }
> = {
  en: {
    brandTag: "Performance intelligence",
    description:
      "Premium AI workspace for serious traders: market intelligence, AI signals, journal, execution review, playbook, reports and coaching in one system.",
    choosePlan: "Choose plan",
    dashboardGuide: "Dashboard guide",
    disclaimer:
      "SkillEdge AI is not financial advice and does not guarantee profits. The platform is built to improve structure, review, decision quality and trading process.",
    productColumn: "Product",
    resourcesColumn: "Resources",
    documentsColumn: "Documents",
    contacts: "Contacts",
    location: "Dubai / Warsaw / Kyiv",
    demo: "Product demo by request",
    rights: "© 2026 SkillEdge AI. All rights reserved.",
    bottomNote: "Context. Risk. Execution. Review.",
    productLinks: [
      { label: "Home", href: "/" },
      { label: "Product", href: "/product" },
      { label: "Pricing", href: "/pricing" },
      { label: "About", href: "/about" },
      { label: "Dashboard", href: "/dashboard" },
    ],
    resourceLinks: [
      { label: "Dashboard guide", href: "/dashboard-guide" },
      { label: "Trading Journal Guide", href: "/journal-guide" },
      { label: "AI Guide", href: "/ai-guide" },
      { label: "Referral program", href: "/referral" },
    ],
    documentLinks: [
      { label: "Privacy Policy", href: "/legal/privacy-policy" },
      { label: "Terms & Conditions", href: "/legal/terms" },
      { label: "Disclaimer", href: "/legal/disclaimer" },
      { label: "EULA", href: "/legal/eula" },
      { label: "Billing & Cancellation", href: "/legal/billing" },
      { label: "Cookie Policy", href: "/legal/cookies" },
    ],
  },
  ru: {
    brandTag: "Интеллект эффективности",
    description:
      "Премиальное AI-пространство для серьёзных трейдеров: рыночная разведка, AI-сигналы, журнал, разбор исполнения, плейбук, отчёты и коучинг в одной системе.",
    choosePlan: "Выбрать тариф",
    dashboardGuide: "Гайд по кабинету",
    disclaimer:
      "SkillEdge AI не является финансовой рекомендацией и не гарантирует прибыль. Платформа создана для улучшения структуры, разбора, качества решений и торгового процесса.",
    productColumn: "Продукт",
    resourcesColumn: "Ресурсы",
    documentsColumn: "Документы",
    contacts: "Контакты",
    location: "Dubai / Warsaw / Kyiv",
    demo: "Демо продукта по запросу",
    rights: "© 2026 SkillEdge AI. Все права защищены.",
    bottomNote: "Контекст. Риск. Исполнение. Разбор.",
    productLinks: [
      { label: "Главная", href: "/" },
      { label: "Продукт", href: "/product" },
      { label: "Тарифы", href: "/pricing" },
      { label: "О нас", href: "/about" },
      { label: "Кабинет", href: "/dashboard" },
    ],
    resourceLinks: [
      { label: "Гайд по личному кабинету", href: "/dashboard-guide" },
      { label: "Гайд по журналу сделок", href: "/journal-guide" },
      { label: "Гайд по AI", href: "/ai-guide" },
      { label: "Реферальная программа", href: "/referral" },
    ],
    documentLinks: [
      { label: "Политика конфиденциальности", href: "/legal/privacy-policy" },
      { label: "Условия использования", href: "/legal/terms" },
      { label: "Дисклеймер", href: "/legal/disclaimer" },
      { label: "Лицензионное соглашение", href: "/legal/eula" },
      { label: "Оплата и отмена", href: "/legal/billing" },
      { label: "Политика cookies", href: "/legal/cookies" },
    ],
  },
  ua: {
    brandTag: "Інтелект ефективності",
    description:
      "Преміальний AI-простір для серйозних трейдерів: ринкова розвідка, AI-сигнали, журнал, розбір виконання, плейбук, звіти та коучинг в одній системі.",
    choosePlan: "Обрати тариф",
    dashboardGuide: "Гайд по кабінету",
    disclaimer:
      "SkillEdge AI не є фінансовою рекомендацією та не гарантує прибуток. Платформа створена для покращення структури, розбору, якості рішень і торгового процесу.",
    productColumn: "Продукт",
    resourcesColumn: "Ресурси",
    documentsColumn: "Документи",
    contacts: "Контакти",
    location: "Dubai / Warsaw / Kyiv",
    demo: "Демо продукту за запитом",
    rights: "© 2026 SkillEdge AI. Усі права захищені.",
    bottomNote: "Контекст. Ризик. Виконання. Розбір.",
    productLinks: [
      { label: "Головна", href: "/" },
      { label: "Продукт", href: "/product" },
      { label: "Тарифи", href: "/pricing" },
      { label: "Про нас", href: "/about" },
      { label: "Кабінет", href: "/dashboard" },
    ],
    resourceLinks: [
      { label: "Гайд по особистому кабінету", href: "/dashboard-guide" },
      { label: "Гайд по журналу угод", href: "/journal-guide" },
      { label: "Гайд по AI", href: "/ai-guide" },
      { label: "Партнерська програма", href: "/referral" },
    ],
    documentLinks: [
      { label: "Політика конфіденційності", href: "/legal/privacy-policy" },
      { label: "Умови використання", href: "/legal/terms" },
      { label: "Дисклеймер", href: "/legal/disclaimer" },
      { label: "Ліцензійна угода", href: "/legal/eula" },
      { label: "Оплата та скасування", href: "/legal/billing" },
      { label: "Політика cookies", href: "/legal/cookies" },
    ],
  },
};

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div>
      <div className="text-xs font-black uppercase tracking-[0.22em] text-white/35">
        {title}
      </div>

      <div className="mt-4 space-y-3">
        {links.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block text-left text-sm font-semibold leading-5 text-white/58 transition hover:text-white"
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function SiteFooter({
  language,
  className = "",
  onChoosePlan,
}: SiteFooterProps) {
  const copy = FOOTER_COPY[normalizeFooterLanguage(language)];

  const choosePlanButton = onChoosePlan ? (
    <button
      type="button"
      onClick={onChoosePlan}
      className="rounded-full bg-[#00C076] px-6 py-3 text-sm font-black text-[#07111F] transition hover:-translate-y-0.5 hover:bg-[#00D084]"
    >
      {copy.choosePlan} →
    </button>
  ) : (
    <Link
      href="/pricing"
      className="rounded-full bg-[#00C076] px-6 py-3 text-sm font-black text-[#07111F] transition hover:-translate-y-0.5 hover:bg-[#00D084]"
    >
      {copy.choosePlan} →
    </Link>
  );

  const guideButton = (
    <Link
      href="/dashboard-guide"
      className="rounded-full border border-white/10 bg-white/[0.04] px-6 py-3 text-sm font-black text-white/75 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
    >
      {copy.dashboardGuide}
    </Link>
  );

  return (
    <footer className={`relative mt-20 overflow-hidden border-t border-white/10 bg-[#07111F] ${className}`}>
      <div className="absolute -left-32 top-10 h-80 w-80 rounded-full bg-[#C8A96B]/10 blur-3xl" />
      <div className="absolute -right-32 bottom-10 h-80 w-80 rounded-full bg-[#00C076]/10 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-4 py-12 md:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.15fr_1.85fr]">
          <div>
            <Link href="/" className="flex items-center gap-3 text-left">
              <BrandMark size="md" />

              <div>
                <div className="text-xl font-semibold text-white">
                  SkillEdge AI
                </div>
                <div className="mt-1 text-xs uppercase tracking-[0.22em] text-white/40">
                  {copy.brandTag}
                </div>
              </div>
            </Link>

            <p className="mt-6 max-w-md text-sm leading-7 text-white/55">
              {copy.description}
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              {choosePlanButton}
              {guideButton}
            </div>

            <div className="mt-6 rounded-3xl border border-amber-300/15 bg-amber-300/[0.035] p-4 text-xs leading-6 text-amber-50/65">
              {copy.disclaimer}
            </div>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <FooterColumn title={copy.productColumn} links={copy.productLinks} />
            <FooterColumn title={copy.resourcesColumn} links={copy.resourceLinks} />
            <FooterColumn title={copy.documentsColumn} links={copy.documentLinks} />
          </div>
        </div>

        <div className="mt-12 grid gap-6 border-t border-white/10 pt-8 text-sm text-white/45 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <div className="font-semibold text-white/70">{copy.contacts}</div>

            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
              <span>support@upyourskills.site</span>
              <span>{copy.location}</span>
              <span>{copy.demo}</span>
            </div>
          </div>

          <div className="md:text-right">
            <div>{copy.rights}</div>
            <div className="mt-2 text-xs text-white/35">{copy.bottomNote}</div>
          </div>
        </div>
      </div>
    </footer>
  );
}

