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

function getRiskReward(alert: TelegramSignalAlert) {
  const engine = alert.source_data?.skillEdgeEngine;

  if (engine && typeof engine === "object" && "riskRewardRatio" in engine) {
    return String((engine as { riskRewardRatio?: unknown }).riskRewardRatio ?? "—");
  }

  return "—";
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

  const targets = [alert.target_1, alert.target_2, alert.target_3]
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .map(formatPrice)
    .join(" / ");

  const dashboardUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://www.upyourskills.site";

  return [
    `🚨 <b>SkillEdge AI Signal</b>`,
    ``,
    `<b>${escapeHtml(alert.symbol)}</b> · ${escapeHtml(venue)}`,
    `<b>Status:</b> ${escapeHtml(alert.status.toUpperCase())}`,
    `<b>Direction:</b> ${escapeHtml(direction)}`,
    `<b>Score:</b> ${escapeHtml(alert.score)}`,
    ``,
    `<b>Setup:</b> ${escapeHtml(alert.setup_type)}`,
    `<b>Trigger:</b> ${escapeHtml(alert.trigger_label || "wait for confirmation")}`,
    `<b>Entry:</b> ${escapeHtml(entry)}`,
    `<b>Stop:</b> ${escapeHtml(formatPrice(alert.stop_price))}`,
    `<b>Targets:</b> ${escapeHtml(targets || "—")}`,
    `<b>RR:</b> ${escapeHtml(getRiskReward(alert))}R`,
    ``,
    `<b>Risk:</b> ${escapeHtml(alert.risk_note || "Confirm manually. No chase.")}`,
    ``,
    `<a href="${dashboardUrl}/dashboard?tab=signals&assetType=${alert.asset_type}">Open Signals Center</a>`,
  ].join("\n");
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

