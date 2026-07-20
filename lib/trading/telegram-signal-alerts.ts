type TelegramSignalAlert = {
  alert_key: string;
  symbol: string;
  asset_type: "stock" | "crypto";
  direction: string;
  status: "active" | "armed" | "watch";
  score: number;
  setup_type: string;
  trigger_label?: string | null;
  entry_zone_min?: number | null;
  entry_zone_max?: number | null;
  stop_price?: number | null;
  target_1?: number | null;
  target_2?: number | null;
  target_3?: number | null;
  risk_note?: string | null;
  reason?: string | null;
  source_data?: Record<string, unknown> | null;
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatPrice(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";

  const abs = Math.abs(value);

  if (abs >= 100) return value.toFixed(2);
  if (abs >= 10) return value.toFixed(3);
  if (abs >= 1) return value.toFixed(4);
  if (abs >= 0.1) return value.toFixed(5);
  if (abs >= 0.01) return value.toFixed(6);
  if (abs >= 0.001) return value.toFixed(7);

  return value.toFixed(8);
}

function getVenue(alert: TelegramSignalAlert) {
  const sourceData = alert.source_data || {};
  const venue = sourceData.cryptoSignalVenue || sourceData.cryptoMarketGate;

  if (typeof venue === "string") return venue;

  if (venue && typeof venue === "object" && "venue" in venue) {
    return String((venue as { venue?: unknown }).venue || "");
  }

  return alert.asset_type === "crypto" ? "crypto" : "stocks";
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.-]/g, ""));

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function readPath(source: unknown, path: string[]) {
  let current: unknown = source;

  for (const key of path) {
    const record = readRecord(current);
    current = record[key];
  }

  return current;
}

function getRiskReward(alert: TelegramSignalAlert) {
  const engine = alert.source_data?.skillEdgeEngine;

  if (engine && typeof engine === "object" && "riskRewardRatio" in engine) {
    return String((engine as { riskRewardRatio?: unknown }).riskRewardRatio ?? "—");
  }

  return "—";
}

function getDirectionSide(alert: TelegramSignalAlert) {
  return alert.direction === "downside" ? "short" : "long";
}

function getEntryMidpoint(alert: TelegramSignalAlert) {
  const entryMin = readNumber(alert.entry_zone_min);
  const entryMax = readNumber(alert.entry_zone_max);

  if (entryMin === null || entryMax === null) return null;

  return (entryMin + entryMax) / 2;
}

function getTwoRTarget(alert: TelegramSignalAlert) {
  if (alert.asset_type !== "stock") return null;

  const entry = getEntryMidpoint(alert);
  const stop = readNumber(alert.stop_price);

  if (entry === null || stop === null) return null;

  if (getDirectionSide(alert) === "short") {
    const risk = stop - entry;

    if (risk <= 0) return null;

    return entry - risk * 2;
  }

  const risk = entry - stop;

  if (risk <= 0) return null;

  return entry + risk * 2;
}

function getCurrentPrice(alert: TelegramSignalAlert) {
  return (
    readNumber(
      readPath(alert.source_data, [
        "market",
        "raw_data",
        "watchlistTechnical",
        "data_coverage",
        "priceFreshness",
        "currentPrice",
      ])
    ) ??
    readNumber(
      readPath(alert.source_data, [
        "market",
        "raw_data",
        "watchlistTechnical",
        "technical_snapshot",
        "priceFreshness",
        "currentPrice",
      ])
    ) ??
    null
  );
}

function getTelegramRiskReward(alert: TelegramSignalAlert) {
  if (alert.asset_type === "stock" && getTwoRTarget(alert) !== null) {
    return "2.00";
  }

  return getRiskReward(alert);
}

function getTelegramTargets(alert: TelegramSignalAlert) {
  if (alert.asset_type === "stock") {
    const twoRTarget = getTwoRTarget(alert);

    if (twoRTarget !== null) {
      return `TP1 2R: ${formatPrice(twoRTarget)}`;
    }
  }

  return [alert.target_1, alert.target_2, alert.target_3]
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .map(formatPrice)
    .join(" / ") || "—";
}

function getDirectionalSetupLabel(alert: TelegramSignalAlert) {
  const setup = String(alert.setup_type || "").toLowerCase();
  const isShort = getDirectionSide(alert) === "short";

  if (alert.asset_type === "stock") {
    if (setup.includes("vwap")) {
      return isShort ? "VWAP Rejection Short" : "VWAP Reclaim Long";
    }

    if (setup.includes("opening range")) {
      return isShort ? "Opening Range Breakdown Short" : "Opening Range Breakout Long";
    }

    if (setup.includes("gap") || setup.includes("crap")) {
      return "Gap & Crap Short";
    }

    if (setup.includes("news") || setup.includes("continuation")) {
      return isShort ? "News Fade / Continuation Short" : "News Continuation Pullback Long";
    }

    if (setup.includes("trend")) {
      return isShort ? "Trend Pullback Continuation Short" : "Trend Pullback Continuation Long";
    }
  }

  return alert.setup_type || "Setup forming";
}

function getModeLine(alert: TelegramSignalAlert) {
  if (alert.status === "armed") {
    return alert.asset_type === "stock"
      ? "ARMED — wait for confirmation. No chase."
      : "ARMED — wait for trigger confirmation.";
  }

  if (alert.status === "active") {
    return "ACTIVE — trigger fired. Validate spread/liquidity.";
  }

  return "WATCH — setup forming.";
}

function getTriggerLine(alert: TelegramSignalAlert) {
  if (alert.asset_type === "stock" && alert.status === "armed") {
    return getDirectionSide(alert) === "short"
      ? "Enter only after rejection/breakdown confirms."
      : "Enter only after reclaim/breakout confirms.";
  }

  return alert.trigger_label || "wait for confirmation";
}

function getStockRunnerLine(alert: TelegramSignalAlert) {
  if (alert.asset_type !== "stock") return null;

  return "Runner: optional only after BE / client discretion.";
}

export function shouldSendTelegramSignal(alert: TelegramSignalAlert) {
  if (process.env.TELEGRAM_SIGNALS_ENABLED !== "true") return false;
  if (alert.status === "watch") return false;

  const minStatus = process.env.TELEGRAM_SIGNALS_MIN_STATUS || "armed";

  if (minStatus === "active" && alert.status !== "active") return false;

  return true;
}

export function formatTelegramSignal(alert: TelegramSignalAlert) {
  const direction =
    alert.direction === "downside" ? "SHORT / DOWNSIDE" : "LONG / UPSIDE";
  const venue = getVenue(alert);

  const entry =
    alert.entry_zone_min !== null &&
    alert.entry_zone_min !== undefined &&
    alert.entry_zone_max !== null &&
    alert.entry_zone_max !== undefined
      ? `${formatPrice(alert.entry_zone_min)} – ${formatPrice(alert.entry_zone_max)}`
      : "—";

  const dashboardUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://www.upyourskills.site";

  const currentPrice = getCurrentPrice(alert);
  const currentLine =
    currentPrice !== null ? `<b>Current:</b> ${escapeHtml(formatPrice(currentPrice))}` : null;
  const runnerLine = getStockRunnerLine(alert);

  return [
    `🚨 <b>SkillEdge AI Signal</b>`,
    ``,
    `<b>${escapeHtml(alert.symbol)}</b> · ${escapeHtml(venue)}`,
    `<b>Status:</b> ${escapeHtml(alert.status.toUpperCase())}`,
    `<b>Mode:</b> ${escapeHtml(getModeLine(alert))}`,
    `<b>Direction:</b> ${escapeHtml(direction)}`,
    `<b>Score:</b> ${escapeHtml(alert.score)}`,
    ``,
    `<b>Setup:</b> ${escapeHtml(getDirectionalSetupLabel(alert))}`,
    `<b>Trigger:</b> ${escapeHtml(getTriggerLine(alert))}`,
    currentLine,
    `<b>Entry:</b> ${escapeHtml(entry)}`,
    `<b>Stop:</b> ${escapeHtml(formatPrice(alert.stop_price))}`,
    `<b>Target:</b> ${escapeHtml(getTelegramTargets(alert))}`,
    `<b>Plan RR:</b> ${escapeHtml(getTelegramRiskReward(alert))}R`,
    runnerLine ? `<b>${escapeHtml(runnerLine)}</b>` : null,
    ``,
    `<b>Risk:</b> ${escapeHtml(alert.risk_note || "Confirm manually. No chase.")}`,
    ``,
    `<a href="${dashboardUrl}/dashboard?tab=signals&assetType=${alert.asset_type}">Open Signals Center</a>`,
  ]
    .filter((line): line is string => typeof line === "string")
    .join("\n");
}

export async function sendTelegramSignalMessage(params: {
  chatId: string;
  alert: TelegramSignalAlert;
}) {
  const token = process.env.TELEGRAM_SIGNALS_BOT_TOKEN;

  if (!token) {
    return { ok: false, error: "TELEGRAM_SIGNALS_BOT_TOKEN is missing" };
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: params.chatId,
      text: formatTelegramSignal(params.alert),
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    return {
      ok: false,
      error: JSON.stringify(data || { status: response.status }),
    };
  }

  return { ok: true, data };
}

export async function sendTelegramPlainMessage(params: {
  chatId: string;
  text: string;
}) {
  const token = process.env.TELEGRAM_SIGNALS_BOT_TOKEN;

  if (!token) {
    return { ok: false, error: "TELEGRAM_SIGNALS_BOT_TOKEN is missing" };
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: params.chatId,
      text: params.text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    return {
      ok: false,
      error: JSON.stringify(data || { status: response.status }),
    };
  }

  return { ok: true, data };
}

