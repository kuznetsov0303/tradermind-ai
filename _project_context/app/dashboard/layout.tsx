import Link from "next/link";
import BrandMark from "@/components/marketing/BrandMark";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}

      <footer className="border-t border-white/10 bg-[#070b16] px-4 py-8 text-white md:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-6 rounded-[1.75rem] border border-white/10 bg-white/[0.025] p-5 md:grid-cols-[1fr_auto] md:items-center md:p-6">
            <div className="flex items-start gap-4">
              <BrandMark size="sm" />

              <div>
                <div className="text-sm font-semibold text-white">
                  SkillEdge AI
                </div>

                <p className="mt-2 max-w-2xl text-xs leading-6 text-white/45">
                  SkillEdge AI is not financial advice and does not guarantee
                  profits. The platform is built to improve structure, review,
                  decision quality and trading process.
                </p>

                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-white/38">
                  <span>support@upyourskills.site</span>
                  <span>Dubai / Warsaw / Kyiv</span>
                  <span>© 2026 SkillEdge AI</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 text-xs text-white/48 md:justify-end">
              <Link
                href="/legal/privacy-policy"
                className="transition hover:text-white"
              >
                Privacy
              </Link>

              <Link
                href="/legal/terms"
                className="transition hover:text-white"
              >
                Terms
              </Link>

              <Link
                href="/legal/disclaimer"
                className="transition hover:text-white"
              >
                Disclaimer
              </Link>

              <Link
                href="/legal/eula"
                className="transition hover:text-white"
              >
                EULA
              </Link>

              <Link
                href="/legal/billing"
                className="transition hover:text-white"
              >
                Billing
              </Link>

              <Link
                href="/legal/cookies"
                className="transition hover:text-white"
              >
                Cookies
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}