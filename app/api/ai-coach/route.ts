import { NextResponse } from "next/server";

type PlanId = "starter" | "pro" | "elite";

const PLAN_CONFIG: Record<
  PlanId,
  {
    model: string;
    dailyLimitPerIp: number;
    maxInputChars: number;
    maxOutputTokens: number;
    label: string;
  }
> = {
  starter: {
    model: "gpt-5-nano",
    dailyLimitPerIp: 50,
    maxInputChars: 800,
    maxOutputTokens: 350,
    label: "Starter",
  },
  pro: {
    model: "gpt-5-mini",
    dailyLimitPerIp: 50,
    maxInputChars: 1800,
    maxOutputTokens: 800,
    label: "Pro",
  },
  elite: {
    model: "gpt-5.1",
    dailyLimitPerIp: 200,
    maxInputChars: 4000,
    maxOutputTokens: 1500,
    label: "Elite",
  },
};

const usageStore = new Map<string, { count: number; resetAt: number }>();

function getClientIp(req: Request) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function normalizePlan(planId: unknown): PlanId {
  if (planId === "starter" || planId === "pro" || planId === "elite") {
    return planId;
  }

  return "starter";
}

function getUsageKey(ip: string, plan: PlanId) {
  const today = new Date().toISOString().slice(0, 10);
  return `${ip}:${plan}:${today}`;
}

function checkAndIncrementLimit(ip: string, plan: PlanId) {
  const config = PLAN_CONFIG[plan];
  const key = getUsageKey(ip, plan);
  const now = Date.now();
  const existing = usageStore.get(key);

  if (!existing || existing.resetAt < now) {
    usageStore.set(key, {
      count: 1,
      resetAt: now + 24 * 60 * 60 * 1000,
    });

    return {
      allowed: true,
      remaining: config.dailyLimitPerIp - 1,
    };
  }

  if (existing.count >= config.dailyLimitPerIp) {
    return {
      allowed: false,
      remaining: 0,
    };
  }

  existing.count += 1;
  usageStore.set(key, existing);

  return {
    allowed: true,
    remaining: config.dailyLimitPerIp - existing.count,
  };
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          reply: "AI is not configured yet. Missing OPENAI_API_KEY.",
        },
        { status: 500 }
      );
    }

    const body = await req.json();
    const message = String(body?.message || "").trim();
    const plan = normalizePlan(body?.planId);
    const config = PLAN_CONFIG[plan];

    if (!message) {
      return NextResponse.json(
        { reply: "Please enter a trading question." },
        { status: 400 }
      );
    }

    if (message.length > config.maxInputChars) {
      return NextResponse.json(
        {
          reply: `Your message is too long for ${config.label}. Limit: ${config.maxInputChars} characters.`,
        },
        { status: 400 }
      );
    }

    const ip = getClientIp(req);
    const limit = checkAndIncrementLimit(ip, plan);

    if (!limit.allowed) {
      return NextResponse.json(
        {
          reply: `Daily AI limit reached for ${config.label}. Upgrade plan or try again tomorrow.`,
        },
        { status: 429 }
      );
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.maxOutputTokens,
        temperature: 0.35,
        messages: [
          {
            role: "system",
            content:
              "You are TraderMind AI, a professional trading performance coach. Be practical, direct and concise. Focus on discipline, risk, execution, setup quality, gappers, halts, screenshots and pattern review. Do not give guaranteed predictions or financial promises. Always remind the user to manage risk.",
          },
          {
            role: "user",
            content: message,
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          reply: `OpenAI error: ${data?.error?.message || "Unknown error"}`,
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      reply: data.choices?.[0]?.message?.content || "No text returned.",
      plan,
      model: config.model,
      remaining: limit.remaining,
    });
  } catch (error) {
    return NextResponse.json(
      {
        reply: "AI backend error. Check server logs.",
      },
      { status: 500 }
    );
  }
}