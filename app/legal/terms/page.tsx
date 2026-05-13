import type { Metadata } from "next";
import LegalPageShell from "@/components/marketing/LegalPageShell";

export const metadata: Metadata = {
  title: "Terms & Conditions — SkillEdge AI",
  description:
    "SkillEdge AI terms of use covering account access, subscriptions, AI features, trading journal, market data, support, restrictions and liability limits.",
};

export default function TermsPage() {
  return (
    <LegalPageShell
      title="Terms & Conditions"
      description="Rules for using SkillEdge AI: account access, subscriptions, AI-assisted features, journal data, market intelligence, alerts, support and user responsibilities."
      updatedAt="Last updated: May 2026"
      sections={[
        {
          title: "1. Acceptance of these terms",
          text: "By using the SkillEdge AI website, dashboard, trading journal, screenshots, AI Coach, reports, alerts, market intelligence, learning materials, support tools or any other product feature, the user agrees to follow these Terms & Conditions. If the user does not agree, the user should not use the platform.",
        },
        {
          title: "2. What SkillEdge AI is",
          text: "SkillEdge AI is a software platform for traders. It may include a trading journal, screenshot storage, analytics, AI-assisted coaching, chart review, market intelligence, alerts, reports, playbooks, learning blocks, support and execution review tools. The platform is built for informational, educational, analytical and organizational purposes. SkillEdge AI does not manage user funds and does not make trading decisions for the user.",
        },
        {
          title: "3. No financial advice",
          text: "SkillEdge AI does not provide financial, investment, legal or tax advice. AI output, alerts, market data, reports, setup breakdowns, entry zones, stops, targets, scores, scenarios, risk notes and educational content are not individual recommendations to buy, sell, hold or short any asset. The user is solely responsible for all trading and investment decisions.",
        },
        {
          title: "4. Account responsibility",
          text: "The user is responsible for account security, accurate information, compliance with law, broker rules, exchange rules, tax requirements and personal risk management. The user must not share account access, access another user’s data, bypass plan limits, overload the service or use the platform for unlawful activity.",
        },
        {
          title: "5. Plans, subscriptions and access",
          text: "Access to features may depend on the selected plan, payment status, access period, usage limits and technical availability. Core, Edge and Elite may include different limits for trades, screenshots, AI requests, reports, market intelligence, scanner features, alerts and other functionality. SkillEdge AI may update prices, limits and plan composition with reasonable notice when required.",
        },
        {
          title: "6. Payments",
          text: "SkillEdge AI may support crypto payments and, when available, card payments through an approved merchant provider. For crypto payments, the user selects a plan, follows the payment instructions, sends payment and provides the transaction identifier or confirmation. Access is activated after payment verification. Card payments, when enabled, may be processed by a third-party payment provider under its own rules.",
        },
        {
          title: "7. AI-assisted features and alerts",
          text: "AI Coach, AI reports, AI alerts, market briefs, chart analysis, journal analysis and related features are designed to help users structure their process, review mistakes, prepare scenarios and organize information. AI output may be inaccurate, incomplete, delayed or unsuitable for a specific context. Alerts are not orders to trade. The user must verify market context, liquidity, news, risk/reward, position size and personal trading rules.",
        },
        {
          title: "8. Market data and external sources",
          text: "SkillEdge AI may display or process market data, prices, charts, volume, tickers, news, catalysts, social attention, halt data, heatmaps and other external information. Such information may be delayed, incomplete, unavailable or incorrect. The user should verify important data through independent sources before acting.",
        },
        {
          title: "9. Journal, screenshots and user content",
          text: "The user may upload or enter trades, screenshots, tickers, PnL, notes, trade plans, AI requests and other materials. The user is responsible for the accuracy and legality of this content and confirms that the user has the right to use it. SkillEdge AI may process this content to display analytics, generate reports, review execution, detect patterns and provide account-specific feedback.",
        },
        {
          title: "10. Brokers, exchanges and third-party platforms",
          text: "SkillEdge AI does not provide brokerage, exchange, payment-intermediary or financial-intermediary services and does not open accounts on behalf of users. The user independently chooses any broker, exchange or third-party platform and must follow the rules of that provider and the user’s jurisdiction. Support may provide general information only and does not guarantee account approval, bonuses, fees, market access, order execution or withdrawals.",
        },
        {
          title: "11. Prohibited use",
          text: "The user must not hack the service, bypass plan limits, overload APIs, scrape protected areas, copy the interface or product logic, reverse engineer private workflows, extract internal prompts, resell access, build a competing product from SkillEdge AI materials or use the platform unlawfully.",
        },
        {
          title: "12. Service changes",
          text: "SkillEdge AI may update, improve, restrict, replace or remove features as the product evolves. Some features may be available only on specific plans, subject to usage limits, or dependent on external providers and technical availability.",
        },
        {
          title: "13. Limitation of liability",
          text: "To the maximum extent permitted by law, SkillEdge AI is not responsible for trading losses, lost profits, user errors, decisions based on AI output, delayed or incorrect market data, broker or exchange issues, payment provider issues, hosting outages, third-party API problems or other external service failures. The user uses the platform at the user’s own risk.",
        },
        {
          title: "14. Contact",
          text: "Questions about these Terms & Conditions can be sent to support@upyourskills.site.",
        },
      ]}
    />
  );
}

