import type { Metadata } from "next";
import LegalPageShell from "@/components/marketing/LegalPageShell";

export const metadata: Metadata = {
  title: "Cookie Policy — SkillEdge AI",
  description:
    "SkillEdge AI cookie policy covering essential cookies, functional cookies, analytics, payment security and user preferences.",
};

export default function CookiePolicyPage() {
  return (
    <LegalPageShell
      title="Cookie Policy"
      description="How SkillEdge AI may use cookies and similar technologies on the website and inside the dashboard."
      updatedAt="Last updated: May 2026"
      sections={[
        {
          title: "1. What cookies are",
          text: "Cookies are small files or similar technologies that may be stored in a user’s browser. They help the website and platform work correctly, preserve preferences, maintain authentication, improve security and understand product usage.",
        },
        {
          title: "2. Essential cookies",
          text: "SkillEdge AI may use essential cookies for core website and dashboard functionality, including account login, session management, security, access checks, paid feature access, abuse prevention and platform stability.",
        },
        {
          title: "3. Functional cookies",
          text: "Functional cookies may be used to remember preferences such as interface language, selected tabs, dashboard state, display settings, recently used sections, watchlist preferences and other product settings.",
        },
        {
          title: "4. Analytics cookies",
          text: "Analytics cookies may help SkillEdge AI understand page performance, user journeys, conversion, errors, loading speed, feature usage and product quality. Analytics data is used to improve the platform and user experience.",
        },
        {
          title: "5. Payment and security technologies",
          text: "If payments are processed through an approved merchant provider, that provider may use its own cookies or similar technologies for checkout, fraud prevention, payment security and subscription processing. Those technologies may be governed by the provider’s own policies.",
        },
        {
          title: "6. Marketing cookies",
          text: "If advertising pixels, retargeting, affiliate tracking, conversion tracking or similar marketing tools are used, they should be reflected in the cookie banner or consent settings where required by applicable law.",
        },
        {
          title: "7. Cookie choices",
          text: "Where required, SkillEdge AI may provide a cookie banner or settings panel so users can manage consent for non-essential cookies. Essential cookies may remain necessary for authentication, security and core platform operation.",
        },
        {
          title: "8. Browser controls",
          text: "Users can restrict or disable cookies through browser settings. Some parts of the website or dashboard may not work correctly without cookies, including login, saved preferences, dashboard access, checkout or certain security features.",
        },
        {
          title: "9. Updates",
          text: "SkillEdge AI may update this Cookie Policy when product functionality, analytics, payment processing, marketing tools, dashboard behavior or legal requirements change.",
        },
      ]}
    />
  );
}

