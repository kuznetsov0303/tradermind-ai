import type { Metadata } from "next";
import LegalPageShell from "@/components/marketing/LegalPageShell";

export const metadata: Metadata = {
  title: "Privacy Policy — SkillEdge AI",
  description:
    "SkillEdge AI privacy policy: how account data, trading journal data, screenshots, support requests, payments, cookies and platform usage data may be processed.",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPageShell
      title="Privacy Policy"
      description="How SkillEdge AI handles account data, trading journal content, screenshots, support requests, payment confirmations, cookies and platform usage data."
      updatedAt="Last updated: May 2026"
      sections={[
        {
          title: "1. Data we may collect",
          text: "SkillEdge AI may collect account information, email address, interface language, selected plan, subscription status, payment confirmations, transaction identifiers for crypto payments, trading journal entries, tickers, PnL, trade notes, screenshots, AI requests, support messages, technical browser data, IP address, cookies and platform usage data.",
        },
        {
          title: "2. Why we use this data",
          text: "We use data to create and secure accounts, operate the dashboard, maintain the trading journal, store screenshots, calculate analytics, generate AI-assisted reviews, enforce plan limits, provide support, process access requests, protect the service from abuse and improve the product experience.",
        },
        {
          title: "3. Trading journal and screenshots",
          text: "Trades, screenshots, notes, trade plans, outcomes and other user materials are intended to remain inside the user account. We do not make this content public without the user’s consent, except where disclosure is required by law or needed to protect the rights, safety or security of the service.",
        },
        {
          title: "4. AI-assisted processing",
          text: "Some user data may be processed by AI systems to provide coaching, reports, chart review, journal review, market briefs, alerts, summaries and other product features. AI-generated output can be incomplete, inaccurate or unsuitable for a specific situation. Users must review all output independently before making any decision.",
        },
        {
          title: "5. Payments and subscription access",
          text: "SkillEdge AI may store information about the selected plan, access period, usage limits, subscription status, payment status, payment confirmation and transaction identifiers needed to activate or manage access. For crypto payments, the user is responsible for selecting the correct network, address, asset, amount and transaction identifier. If card payments are processed through an approved merchant provider, payment data may be handled by that provider under its own privacy and security rules. SkillEdge AI does not intend to store full card numbers on its own servers.",
        },
        {
          title: "6. Service providers",
          text: "We may share limited data with providers that are necessary to operate the product, including hosting, database infrastructure, authentication, email delivery, support tools, payment processing, analytics, security, AI infrastructure and market data services. We do not sell personal data to third parties.",
        },
        {
          title: "7. Cookies and technical data",
          text: "SkillEdge AI may use cookies and similar technologies for authentication, security, saved preferences, interface language, dashboard state, analytics and product improvement. Details are described in the Cookie Policy.",
        },
        {
          title: "8. Security",
          text: "We apply reasonable technical and organizational safeguards, including authentication, server-side access checks, database access rules, protected environment variables, API protection, usage controls and monitoring. No online service can guarantee absolute security.",
        },
        {
          title: "9. User rights",
          text: "Depending on applicable law, users may have the right to request access, correction, deletion, restriction of processing or withdrawal of consent for certain processing activities. Requests can be sent to support@upyourskills.site.",
        },
        {
          title: "10. Updates and contact",
          text: "We may update this Privacy Policy when the product, providers, payments, AI features, cookies or legal requirements change. Questions about privacy can be sent to support@upyourskills.site.",
        },
      ]}
    />
  );
}

