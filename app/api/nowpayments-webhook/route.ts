import crypto from "crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type BillingPeriod = "monthly" | "halfyear" | "yearly";

const ACTIVE_STATUSES = new Set([
  "finished",
  "confirmed",
  "sending",
  "partially_paid",
]);

const FAILED_STATUSES = new Set([
  "failed",
  "refunded",
  "expired",
]);

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortObject((value as Record<string, unknown>)[key]);
        return acc;
      }, {} as Record<string, unknown>);
  }

  return value;
}

function verifyNowPaymentsSignature(rawBody: string, signature: string | null) {
  const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET;

  if (!ipnSecret) {
    throw new Error("Missing NOWPAYMENTS_IPN_SECRET");
  }

  if (!signature) {
    return false;
  }

  const parsedBody = JSON.parse(rawBody);
  const sortedBody = sortObject(parsedBody);
  const signedPayload = JSON.stringify(sortedBody);

  const expectedSignature = crypto
    .createHmac("sha512", ipnSecret)
    .update(signedPayload)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, "hex"),
      Buffer.from(signature, "hex")
    );
  } catch {
    return false;
  }
}

function getExpiresAt(period: BillingPeriod, isDemo = false) {
  const now = new Date();

  if (isDemo) {
    now.setDate(now.getDate() + 7);
    return now.toISOString();
  }

  if (period === "monthly") {
    now.setMonth(now.getMonth() + 1);
  }

  if (period === "halfyear") {
    now.setMonth(now.getMonth() + 6);
  }

  if (period === "yearly") {
    now.setFullYear(now.getFullYear() + 1);
  }

  return now.toISOString();
}

function getAiLimit(planId: string) {
  if (planId === "starter") return 50;
  if (planId === "pro") return 500;
  if (planId === "elite") return 2000;
  return 0;
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-nowpayments-sig");

    const isValid = verifyNowPaymentsSignature(rawBody, signature);

    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid NOWPayments signature" },
        { status: 401 }
      );
    }

    const payload = JSON.parse(rawBody);

    const orderId = payload.order_id ? String(payload.order_id) : null;
    const invoiceId =
      payload.invoice_id || payload.payment_id
        ? String(payload.invoice_id || payload.payment_id)
        : null;

    const paymentStatus = payload.payment_status
      ? String(payload.payment_status)
      : "unknown";

    if (!orderId) {
      return NextResponse.json(
        { error: "Missing order_id" },
        { status: 400 }
      );
    }

    const { data: payment, error: paymentFetchError } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("order_id", orderId)
      .single();

    if (paymentFetchError || !payment) {
      return NextResponse.json(
        {
          error: "Payment not found",
          details: paymentFetchError?.message,
          orderId,
        },
        { status: 404 }
      );
    }

    const { error: paymentUpdateError } = await supabaseAdmin
      .from("payments")
      .update({
        payment_status: paymentStatus,
        invoice_id: invoiceId ?? payment.invoice_id,
        raw_payload: payload,
        paid_at: ACTIVE_STATUSES.has(paymentStatus)
          ? new Date().toISOString()
          : payment.paid_at,
      })
      .eq("order_id", orderId);

    if (paymentUpdateError) {
      return NextResponse.json(
        {
          error: "Failed to update payment",
          details: paymentUpdateError.message,
        },
        { status: 500 }
      );
    }

    if (FAILED_STATUSES.has(paymentStatus)) {
      return NextResponse.json({
        ok: true,
        message: "Payment marked as failed/expired/refunded",
        paymentStatus,
      });
    }

    if (!ACTIVE_STATUSES.has(paymentStatus)) {
      return NextResponse.json({
        ok: true,
        message: "Payment updated, subscription not activated yet",
        paymentStatus,
      });
    }

    const planId = payment.plan_id;
const billingPeriod = payment.billing_period as BillingPeriod;
const isDemo = Boolean(payment.is_demo);

const expiresAt = getExpiresAt(billingPeriod, isDemo);
const aiMonthlyLimit = isDemo ? 10 : getAiLimit(planId);

    const { error: subscriptionDeactivateError } = await supabaseAdmin
      .from("subscriptions")
      .update({ status: "cancelled" })
      .eq("user_id", payment.user_id)
      .eq("status", "active");

    if (subscriptionDeactivateError) {
      return NextResponse.json(
        {
          error: "Failed to deactivate old subscription",
          details: subscriptionDeactivateError.message,
        },
        { status: 500 }
      );
    }

    const { error: subscriptionInsertError } = await supabaseAdmin
      .from("subscriptions")
      .insert({
        user_id: payment.user_id,
        plan_id: planId,
        billing_period: billingPeriod,
        status: "active",
        ai_monthly_limit: aiMonthlyLimit,
        ai_used_this_month: 0,
        started_at: new Date().toISOString(),
        expires_at: expiresAt,
      });

    if (subscriptionInsertError) {
      return NextResponse.json(
        {
          error: "Failed to activate subscription",
          details: subscriptionInsertError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Subscription activated",
      userId: payment.user_id,
      planId,
      billingPeriod,
      paymentStatus,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Webhook processing error";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}