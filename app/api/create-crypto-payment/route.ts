import { NextResponse } from "next/server";

type PlanId = "starter" | "pro" | "elite";

const PLANS: Record<
  PlanId,
  {
    name: string;
    amount: number;
  }
> = {
  starter: {
    name: "SkillEdge AI Starter",
    amount: 19,
  },
  pro: {
    name: "SkillEdge AI Pro",
    amount: 49,
  },
  elite: {
    name: "SkillEdge AI Elite",
    amount: 129,
  },
};

function normalizePlan(planId: unknown): PlanId {
  if (planId === "starter" || planId === "pro" || planId === "elite") {
    return planId;
  }

  return "starter";
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.NOWPAYMENTS_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          error: "Missing NOWPAYMENTS_API_KEY",
        },
        { status: 500 }
      );
    }

    const body = await req.json();
    const planId = normalizePlan(body?.planId);
    const plan = PLANS[planId];

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "https://www.upyourskills.site";

    const orderId = `skilledge_${planId}_${Date.now()}`;

    const response = await fetch("https://api.nowpayments.io/v1/invoice", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        price_amount: plan.amount,
        price_currency: "usd",
        order_id: orderId,
        order_description: `${plan.name} monthly subscription`,
        ipn_callback_url: `${siteUrl}/api/nowpayments-webhook`,
        success_url: `${siteUrl}?payment=success&plan=${planId}`,
        cancel_url: `${siteUrl}?payment=cancelled&plan=${planId}`,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          error: data?.message || data?.error || "NOWPayments error",
          details: data,
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      url: data.invoice_url,
      invoiceId: data.id,
      orderId,
      planId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Crypto payment error";

    return NextResponse.json(
      {
        error: message,
      },
      { status: 500 }
    );
  }
}