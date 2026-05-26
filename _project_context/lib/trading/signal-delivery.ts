import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  loadMarketAlertFeed,
  type MarketAlertAssetTypeFilter,
  type MarketAlertFeedItem,
} from "@/lib/trading/market-alert-feed";
import {
  sendTelegramSignalMessage,
  shouldSendTelegramSignal,
} from "@/lib/trading/telegram-signal-alerts";

type DeliverableAlert = MarketAlertFeedItem & {
  alert_key: string;
  asset_type: "stock" | "crypto";
  status: "active" | "armed" | "watch";
  score: number;
};

function statusAllowed(alertStatus: string, minStatus: string) {
  if (alertStatus === "active") return true;
  if (alertStatus === "armed" && minStatus !== "active") return true;

  return false;
}

function normalizeDeliveryMinStatus(value: string | null | undefined) {
  return value === "active" ? "active" : "armed";
}

export async function deliverSignalsToTelegram(alerts: DeliverableAlert[]) {
  if (process.env.TELEGRAM_SIGNALS_ENABLED !== "true") {
    return { sent: 0, skipped: alerts.length, errors: [] as string[] };
  }

  const errors: string[] = [];
  let sent = 0;
  let skipped = 0;

  const candidates = alerts.filter((alert) => shouldSendTelegramSignal(alert as any));
  const adminChatId = process.env.TELEGRAM_SIGNALS_ADMIN_CHAT_ID;

  const { data: subscribers, error: subscribersError } = await supabaseAdmin
    .from("telegram_signal_subscriptions")
    .select("user_id, chat_id, min_status, asset_filter, is_enabled")
    .eq("is_enabled", true);

  if (subscribersError) {
    errors.push(`Failed to load telegram subscribers: ${subscribersError.message}`);
  }

  const targets = [
    ...(adminChatId
      ? [
          {
            user_id: null,
            chat_id: adminChatId,
            min_status: normalizeDeliveryMinStatus(
              process.env.TELEGRAM_SIGNALS_MIN_STATUS || "armed"
            ),
            asset_filter: "all" as const,
          },
        ]
      : []),
    ...((subscribers || []) as Array<{
      user_id: string | null;
      chat_id: string;
      min_status: string;
      asset_filter: "all" | "stock" | "crypto";
      is_enabled: boolean;
    }>).map((subscriber) => ({
      ...subscriber,
      min_status: normalizeDeliveryMinStatus(subscriber.min_status),
    })),
  ];

  for (const alert of candidates) {
    for (const target of targets) {
      if (target.asset_filter !== "all" && target.asset_filter !== alert.asset_type) {
        skipped += 1;
        continue;
      }

      if (!statusAllowed(alert.status, target.min_status || "armed")) {
        skipped += 1;
        continue;
      }

      const deliveryKey = {
        alert_key: alert.alert_key,
        channel: "telegram",
        target: String(target.chat_id),
      };

      const { data: existing, error: existingError } = await supabaseAdmin
        .from("market_alert_deliveries")
        .select("id")
        .eq("alert_key", deliveryKey.alert_key)
        .eq("channel", deliveryKey.channel)
        .eq("target", deliveryKey.target)
        .maybeSingle();

      if (existingError) {
        errors.push(`Failed to check delivery state: ${existingError.message}`);
        skipped += 1;
        continue;
      }

      if (existing) {
        skipped += 1;
        continue;
      }

      const result = await sendTelegramSignalMessage({
        chatId: String(target.chat_id),
        alert: alert as any,
      });

      await supabaseAdmin.from("market_alert_deliveries").insert({
        ...deliveryKey,
        status: result.ok ? "sent" : "failed",
        error: result.ok ? null : result.error,
      });

      if (result.ok) {
        sent += 1;
      } else {
        errors.push(result.error || "Telegram send failed");
      }
    }
  }

  return { sent, skipped, errors };
}

export async function deliverLatestPersistedSignalsToTelegram(params: {
  assetType?: MarketAlertAssetTypeFilter;
  createdSince?: string | null;
  limit?: number;
}) {
  const feed = await loadMarketAlertFeed({
    assetType: params.assetType || "all",
    status: "tradable",
    period: "24h",
    createdSince: params.createdSince || null,
    limit: params.limit || 100,
    includeExpired: false,
  });

  const delivery = await deliverSignalsToTelegram(feed.items as DeliverableAlert[]);

  return {
    ...delivery,
    feedCount: feed.count,
    source: feed.source,
  };
}

