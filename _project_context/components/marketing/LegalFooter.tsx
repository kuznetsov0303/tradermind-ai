import Link from "next/link";
import BrandMark from "@/components/marketing/BrandMark";

const legalLinks = [
  { label: "Privacy Policy", href: "/legal/privacy-policy" },
  { label: "Terms & Conditions", href: "/legal/terms" },
  { label: "Disclaimer", href: "/legal/disclaimer" },
  { label: "EULA", href: "/legal/eula" },
  { label: "Billing", href: "/legal/billing" },
  { label: "Cookies", href: "/legal/cookies" },
];

const productLinks = [
  { label: "Product", href: "/product" },
  { label: "Pricing", href: "/pricing" },
  { label: "Team", href: "/team" },
  { label: "Home", href: "/" },
];

export default function LegalFooter() {
  return (
    <footer className="mt-12 rounded-[2rem] border border-white/10 bg-white/[0.025] p-6 md:p-8">
      <div className="grid gap-8 lg:grid-cols-[1.05fr_1.4fr]">
        <div>
          <Link href="/" className="flex items-center gap-3">
            <BrandMark size="md" />

            <div>
              <div className="text-xl font-semibold text-white">
                SkillEdge AI
              </div>
              <div className="mt-1 text-xs uppercase tracking-[0.22em] text-white/40">
                Legal & Trust Center
              </div>
            </div>
          </Link>

          <p className="mt-5 max-w-lg text-sm leading-7 text-white/55">
            Premium AI trading workspace for serious traders: market
            intelligence, AI scanner, AI alerts, journal analytics, execution
            review, reports, playbook and coaching in one connected system.
          </p>

          <div className="mt-5 rounded-2xl border border-amber-300/15 bg-amber-300/[0.035] p-4 text-xs leading-6 text-amber-50/65">
            SkillEdge AI is not financial advice and does not guarantee profits.
            Trading and investing involve risk, including the possible loss of
            capital.
          </div>
        </div>

        <div className="grid gap-8 sm:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/35">
              Product
            </div>

            <div className="mt-4 space-y-3">
              {productLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block text-sm text-white/58 transition hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/35">
              Legal
            </div>

            <div className="mt-4 space-y-3">
              {legalLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block text-sm text-white/58 transition hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-4 border-t border-white/10 pt-6 text-xs text-white/40 md:grid-cols-[1fr_auto] md:items-center">
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <span>support@upyourskills.site</span>
          <span>Dubai / Warsaw / Kyiv</span>
          <span>Product demo by request</span>
        </div>

        <div className="md:text-right">
          © 2026 SkillEdge AI. All rights reserved.
        </div>
      </div>
    </footer>
  );
}