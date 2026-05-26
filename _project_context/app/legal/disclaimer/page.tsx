import type { Metadata } from "next";
import LegalPageShell from "@/components/marketing/LegalPageShell";

export const metadata: Metadata = {
  title: "Disclaimer — SkillEdge AI",
  description:
    "SkillEdge AI risk disclaimer covering trading risk, AI limitations, market data limitations, alerts, reports and the absence of profit guarantees.",
};

export default function DisclaimerPage() {
  return (
    <LegalPageShell
      title="Disclaimer"
      description="Important risk notice about trading, AI-assisted analysis, market data, alerts, reports, learning materials and the absence of profit guarantees."
      updatedAt="Last updated: May 2026"
      sections={[
        {
          title: "1. Trading involves risk",
          text: "Trading stocks, ETFs, options, futures, cryptocurrencies and other financial instruments involves substantial risk. A user may lose part or all of the capital allocated to trading. Using SkillEdge AI does not remove market risk, execution risk, liquidity risk, news risk, volatility risk or the risk of user error.",
        },
        {
          title: "2. No financial advice",
          text: "SkillEdge AI is not a financial, investment, legal or tax advisor. AI responses, alerts, market intelligence, reports, setup breakdowns, entry zones, stops, targets, risk notes, scores, scenarios and educational materials are provided for informational and educational purposes only. Nothing on the platform should be treated as an individual recommendation to buy, sell, hold or short any asset.",
        },
        {
          title: "3. No profit guarantee",
          text: "SkillEdge AI does not guarantee profit, accurate predictions, successful trades, improved results, loss prevention or achievement of any financial goal. Examples, statistics, signals, AI reviews, reports and historical data do not guarantee future performance.",
        },
        {
          title: "4. AI alerts are not trade orders",
          text: "AI alerts and trading desk features are designed to help users understand the structure of an idea, including setup, direction, trigger, entry zone, invalidation, stop, targets, risk and management considerations. The final decision always belongs to the user. The user must verify context, liquidity, news, risk/reward, position size and personal trading plan.",
        },
        {
          title: "5. AI limitations",
          text: "AI systems can make mistakes, misinterpret data, miss important factors, generate incomplete output or produce analysis that is not suitable for a specific user or market condition. AI does not know the future price path. A user should not rely on AI as the only source for a trading decision.",
        },
        {
          title: "6. Market data limitations",
          text: "SkillEdge AI may use quotes, charts, news, catalyst information, social attention, halt data, heatmaps and other external market data. Such data may be delayed, incomplete, unavailable or incorrect. Availability and accuracy depend on providers, exchanges, APIs, licenses, plan limits and technical conditions.",
        },
        {
          title: "7. Journal, reports and analytics",
          text: "The trading journal, screenshots, AI reports, execution scoring, weakness mapping, outcome learning and missed opportunity review are designed to help users evaluate process quality. They do not guarantee better results. The user is responsible for the accuracy of entered data and for how the user interprets platform analytics.",
        },
        {
          title: "8. Brokers, exchanges and third-party platforms",
          text: "SkillEdge AI is not a broker, exchange, referral agent, financial intermediary or representative of third-party platforms. Support may provide general information about third-party platforms, but SkillEdge AI does not control their decisions and does not guarantee account approval, verification results, bonuses, fees, market availability, order execution or withdrawals.",
        },
        {
          title: "9. User responsibility",
          text: "The user is solely responsible for all trading decisions, position sizing, risk per trade, broker or exchange selection, commissions, taxes, compliance with law, trading discipline and consequences of the user’s actions. When needed, the user should consult a qualified financial, legal or tax professional.",
        },
      ]}
    />
  );
}

