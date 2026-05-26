import type { Metadata } from "next";
import LegalPageShell from "@/components/marketing/LegalPageShell";

export const metadata: Metadata = {
  title: "Billing & Cancellation Policy — SkillEdge AI",
  description:
    "SkillEdge AI billing and cancellation policy covering plans, crypto payments, card payments through an approved merchant provider, activation, cancellation and refunds.",
};

export default function BillingPolicyPage() {
  return (
    <LegalPageShell
      title="Billing & Cancellation Policy"
      description="How SkillEdge AI handles plans, access periods, payment confirmation, crypto payments, card payments through an approved merchant provider, cancellation and refunds."
      updatedAt="Last updated: May 2026"
      sections={[
        {
          title: "1. Plans and access",
          text: "SkillEdge AI may offer several plans, including Core, Edge and Elite. Each plan may include different features and usage limits, such as journal entries, screenshots, AI Coach, AI reviews, reports, market intelligence, scanner features, alerts and other platform capabilities. Paid access depends on the selected plan, confirmed payment, access period and technical availability.",
        },
        {
          title: "2. Billing periods",
          text: "Plans may be offered on monthly, annual or other billing periods shown on the pricing page or checkout instructions. The selected billing period determines the access period after payment confirmation.",
        },
        {
          title: "3. Crypto payments",
          text: "SkillEdge AI may support crypto payments. The user selects a plan, follows the payment instructions, sends payment and provides the transaction identifier or confirmation when requested. Access is activated after verification by the system or support team. The user is responsible for using the correct network, address, asset, amount, transaction fee and transaction identifier.",
        },
        {
          title: "4. Card payments",
          text: "When card payments are enabled, they may be processed through an approved merchant provider. The provider may handle card verification, checkout, subscription processing, payment security, refunds and disputes under its own terms. SkillEdge AI does not intend to store full card numbers on its own servers.",
        },
        {
          title: "5. Activation of access",
          text: "Access is activated after payment confirmation. Crypto payments may require additional time because of network confirmations and manual or automated verification. If payment is incomplete, sent through the wrong network, missing a valid transaction identifier or not confirmed, access may be delayed or denied.",
        },
        {
          title: "6. Renewal and expiration",
          text: "If access is paid manually, the user may renew by making a new payment for the next period. If automatic billing is enabled through a merchant provider, renewal terms will depend on the checkout flow, provider rules and the plan selected by the user.",
        },
        {
          title: "7. Cancellation",
          text: "For manually paid access, the user can stop using the service or choose not to renew for the next period. For automatic billing, if enabled, the user should cancel renewal through the available billing flow or by contacting support, subject to provider rules and applicable law.",
        },
        {
          title: "8. Refunds",
          text: "Crypto payments may be irreversible. The user must carefully verify the plan, amount, network and payment details before sending funds. Refund eligibility, if any, depends on the payment method, access status, usage, technical facts and applicable law. Card payment refunds, when available, may depend on the merchant provider, bank rules and dispute process.",
        },
        {
          title: "9. Failed, delayed or disputed payments",
          text: "SkillEdge AI may delay, suspend or deny access if payment is not confirmed, disputed, reversed, incomplete, sent incorrectly or flagged for review. The user may be asked to provide payment confirmation, transaction identifier or additional information needed to verify access.",
        },
        {
          title: "10. Plan changes",
          text: "The user may request a plan change where supported. Feature access and limits may change according to the new plan. Upgrade, downgrade, prorating or credit rules may depend on the payment method and the current billing setup.",
        },
        {
          title: "11. No trading funds",
          text: "Payments to SkillEdge AI are payments for software access only. They are not deposits for trading, brokerage accounts, managed accounts, investment products or trading capital. SkillEdge AI does not hold user trading funds.",
        },
        {
          title: "12. No financial advice or profit guarantee",
          text: "Paying for SkillEdge AI does not create any guarantee of profit, better trading results, successful trades, accurate predictions or loss prevention. The platform is designed to support structure, review, discipline and decision quality.",
        },
        {
          title: "13. Pricing changes",
          text: "SkillEdge AI may update prices, plan limits, features and billing terms. Material changes will be reflected on the pricing page or inside the platform where appropriate.",
        },
        {
          title: "14. Contact support",
          text: "Questions about payment, access, cancellation or billing can be sent to support@upyourskills.site.",
        },
      ]}
    />
  );
}

