import type { Metadata } from "next";
import LegalPageShell from "@/components/marketing/LegalPageShell";

export const metadata: Metadata = {
  title: "EULA — SkillEdge AI",
  description:
    "SkillEdge AI end user license agreement covering platform access, software use, intellectual property, user content, AI features and restrictions.",
};

export default function EulaPage() {
  return (
    <LegalPageShell
      title="End User License Agreement"
      description="Rules for using the SkillEdge AI software platform, interface, AI-assisted features, proprietary workflows, content and account access."
      updatedAt="Last updated: May 2026"
      sections={[
        {
          title: "1. License grant",
          text: "Subject to these terms and active access, SkillEdge AI grants the user a limited, non-exclusive, non-transferable and revocable right to use the platform, dashboard, trading journal, screenshots, AI Coach, reports, alerts, market intelligence, playbooks, learning materials and related features for the user’s own internal trading process.",
        },
        {
          title: "2. No ownership transfer",
          text: "Access to SkillEdge AI does not transfer ownership of the product, code, design, brand, interface, workflows, AI logic, prompts, documentation, content structure, pricing architecture or other materials. All rights remain with the owner of SkillEdge AI or the relevant rights holders.",
        },
        {
          title: "3. Intellectual property",
          text: "The SkillEdge AI name, visual identity, interface, software code, product architecture, text, workflows, AI-assisted review logic, alert workflow, journal analytics, reports, playbook structure, market intelligence logic and related materials are protected intellectual property. The user may not copy, reproduce, distribute, resell or use these materials outside the allowed platform access.",
        },
        {
          title: "4. Usage restrictions",
          text: "The user must not copy the product, attempt to obtain source code, bypass plan limits, hack the system, scrape protected data, overload APIs, reverse engineer private workflows, extract internal prompts, resell access, create a competing product based on SkillEdge AI materials or use the platform unlawfully.",
        },
        {
          title: "5. User content",
          text: "The user remains responsible for trades, screenshots, notes, PnL, tickers, trade plans, AI requests, comments and other materials uploaded or entered into SkillEdge AI. The user confirms that the user has the right to use this content and understands that output quality may depend on the accuracy of the submitted information.",
        },
        {
          title: "6. AI-assisted features",
          text: "AI Coach, AI reports, AI alerts, chart review, journal review, market intelligence and related features are part of the software product. Results may be inaccurate, incomplete, delayed or unsuitable for a specific situation. AI-assisted features are not financial, investment, legal or tax advice and do not guarantee trading results.",
        },
        {
          title: "7. Updates and product changes",
          text: "SkillEdge AI may update the platform, modify the interface, adjust features, change plan limits, replace providers, improve backend architecture or change product functionality as the service evolves. Access to some features may depend on plan level, provider availability and technical conditions.",
        },
        {
          title: "8. Suspension or termination",
          text: "User access may be restricted, suspended or terminated for non-payment, abuse, attempted hacking, limit bypassing, violation of SkillEdge AI rights, violation of other users’ rights, illegal use or other misuse of the service.",
        },
        {
          title: "9. Disclaimer of warranties",
          text: "SkillEdge AI is provided on an “as is” and “as available” basis to the maximum extent permitted by law. The platform does not guarantee uninterrupted operation, error-free performance, continuous market data availability, AI accuracy, achievement of trading goals or profit.",
        },
        {
          title: "10. Limitation of liability",
          text: "To the maximum extent permitted by law, SkillEdge AI is not liable for trading losses, lost profits, user errors, incorrect interpretation of AI output, delayed data, broker or exchange issues, payment provider issues, market data provider issues, hosting outages or other third-party failures.",
        },
      ]}
    />
  );
}

