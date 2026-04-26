import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type PlanId = "starter" | "pro" | "elite";
type BillingPeriod = "monthly" | "halfyear" | "yearly";

const PLANS: Record<
  PlanId,
  {
    name: string;
    prices: Record<BillingPeriod, number>;
  }
> = {
  starter: {
    name: "SkillEdge AI Starter",
    prices: {
      monthly: 49,
      halfyear: 249,
      yearly: 399,
    },
  },
  pro: {
    name: "SkillEdge AI Pro",
    prices: {
      monthly: 99,
      halfyear: 499,
      yearly: 799,
    },
  },
  elite: {
    name: "SkillEdge AI Elite",
    prices: {
      monthly: 149,
      halfyear: 749,
      yearly: 1249,
    },
  },
};

const PERIOD_LABELS: Record<BillingPeriod, string> = {
  monthly: "1 month",
  halfyear: "6 months",
  yearly: "1 year",
};

function normalizePlan(planId: unknown): PlanId {
  if (planId === "starter" || planId === "pro" || planId === "elite") {
    return planId;
  }

  return "starter";
}

function normalizeBillingPeriod(period: unknown): BillingPeriod {
  if (period === "monthly" || period === "halfyear" || period === "yearly") {
    return period;
  }

  return "monthly";
}

export async function POST(req: Request) {
  try {
    
    const apiKey = process.env.NOWPAYMENTS_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing NOWPAYMENTS_API_KEY" },
        { status: 500 }
      );
    }

    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json(
        { error: "Please log in before buying a plan." },
        { status: 401 }
      );
    }

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json(
        {
          error: "Invalid user session. Please log in again.",
          details: userError?.message,
        },
        { status: 401 }
      );
    }

    const body = await req.json();

    const planId = normalizePlan(body?.planId);
    const billingPeriod = normalizeBillingPeriod(body?.billingPeriod);

    const plan = PLANS[planId];
    const amount = plan.prices[billingPeriod];

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "https://www.upyourskills.site";

    const orderId = `skilledge_${planId}_${billingPeriod}_${Date.now()}`;

    const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
      id: user.id,
      email: user.email,
    });

    if (profileError) {
      return NextResponse.json(
        {
          error: "Failed to create user profile",
          details: profileError.message,
          debug: {
            userId: user.id,
            email: user.email,
            serviceKeyStart: process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 20),
            serviceKeyHasServiceRole:
              process.env.SUPABASE_SERVICE_ROLE_KEY?.includes("service_role"),
            supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
          },
        },
        { status: 500 }
      );
    }

    const response = await fetch("https://api.nowpayments.io/v1/invoice", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        price_amount: amount,
        price_currency: "usd",
        pay_currency: "usdttrc20",
        order_id: orderId,
        order_description: `${plan.name} subscription — ${PERIOD_LABELS[billingPeriod]} — USDT TRC20 payment`,
        ipn_callback_url: `${siteUrl}/api/nowpayments-webhook`,
        success_url: `${siteUrl}/dashboard?payment=success&plan=${planId}&period=${billingPeriod}`,
        cancel_url: `${siteUrl}/dashboard?payment=cancelled&plan=${planId}&period=${billingPeriod}`,
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

    const { error: paymentInsertError } = await supabaseAdmin
      .from("payments")
      .insert({
        user_id: user.id,
        customer_email: user.email,
        provider: "nowpayments",
        order_id: orderId,
        invoice_id: data.id ? String(data.id) : null,
        amount,
        currency: "USD",
        plan_id: planId,
        billing_period: billingPeriod,
        payment_status: "created",
        raw_payload: data,
      });

    if (paymentInsertError) {
      return NextResponse.json(
        {
          error:
            "Payment invoice was created, but failed to save payment in database",
          details: paymentInsertError.message,
          nowpayments: data,
          debug: {
            userId: user.id,
            email: user.email,
            serviceKeyStart: process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 20),
            serviceKeyHasServiceRole:
              process.env.SUPABASE_SERVICE_ROLE_KEY?.includes("service_role"),
            supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      url: data.invoice_url,
      invoiceId: data.id,
      orderId,
      planId,
      billingPeriod,
      amount,
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