import crypto from "crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type PlanId = "starter" | "pro" | "elite";
type BillingPeriod = "monthly" | "halfyear" | "yearly";

const AI_LIMITS: Record<PlanId, number> = {
  starter: 50,
  pro: 500,
  elite: 2000,
};

const PERIOD_MONTHS: Record<BillingPeriod, number> = {
  monthly: 1,
  halfyear: 6,
  yearly: 12,
};

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce((result, key) => {
        result[key] = sortObject((value as Record<string, unknown>)[key]);
        return result;
      }, {} as Record<string, unknown>);
  }

  return value;
}

function verifyNowPaymentsSignature(rawBody: string, signature: string | null) {
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;

  if (!secret || !signature) {
    return false;
  }

  const parsed = JSON.parse(rawBody);
  const sorted = sortObject(parsed);
  const payload = JSON.stringify(sorted);

  const hmac = crypto
    .createHmac("sha512", secret)
    .update(payload)
    .digest("hex");

  return hmac === signature;
}

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-nowpayments-sig");

    const validSignature = verifyNowPaymentsSignature(rawBody, signature);

    if (!validSignature) {
      return NextResponse.json(
        { ok: false, error: "Invalid NOWPayments signature" },
        { status: 401 }
      );
    }

    const body = JSON.parse(rawBody);

    const orderId = body?.order_id ? String(body.order_id) : null;
    const paymentStatus = body?.payment_status
      ? String(body.payment_status)
      : "unknown";

    if (!orderId) {
      return NextResponse.json(
        { ok: false, error: "Missing order_id" },
        { status: 400 }
      );
    }

    const { data: payment } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("order_id", orderId)
      .maybeSingle();

    if (!payment) {
      return NextResponse.json(
        { ok: false, error: "Payment not found" },
        { status: 404 }
      );
    }

    const isPaid =
      paymentStatus === "finished" || paymentStatus === "confirmed";

    await supabaseAdmin
      .from("payments")
      .update({
        payment_status: paymentStatus,
        raw_payload: body,
        paid_at: isPaid ? new Date().toISOString() : payment.paid_at,
      })
      .eq("order_id", orderId);

    if (isPaid) {
      const planId = payment.plan_id as PlanId;
      const billingPeriod = payment.billing_period as BillingPeriod;

      const startedAt = new Date();
      const expiresAt = addMonths(startedAt, PERIOD_MONTHS[billingPeriod]);

      await supabaseAdmin
        .from("subscriptions")
        .update({ status: "expired" })
        .eq("user_id", payment.user_id)
        .eq("status", "active");

      await supabaseAdmin.from("subscriptions").insert({
        user_id: payment.user_id,
        plan_id: planId,
        billing_period: billingPeriod,
        status: "active",
        ai_monthly_limit: AI_LIMITS[planId],
        ai_used_this_month: 0,
        started_at: startedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
      });
    }

    return NextResponse.json({
      ok: true,
      received: true,
      orderId,
      paymentStatus,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "NOWPayments webhook error";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}