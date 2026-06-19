import { NextRequest } from "next/server";
import {
  STOCK_ENGINE_BASE_URL,
  fetchStockEngineJson,
} from "@/lib/stockEngineProxy";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function clampInterval(raw: string | null) {
  const value = Number(raw || 5000);
  if (!Number.isFinite(value)) return 5000;
  return Math.max(2000, Math.min(15000, Math.floor(value)));
}

function sse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const limit = Math.max(20, Math.min(250, Number(url.searchParams.get("limit") || 160)));
  const intervalMs = clampInterval(url.searchParams.get("interval"));
  const symbol = String(url.searchParams.get("symbol") || "")
    .trim()
    .toUpperCase();
  const includeCandles = url.searchParams.get("include_candles") !== "false";

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | null = null;
  let closed = false;
  let seq = 0;
  let lastLifecycleEventKey = "";

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sse(event, data)));
        } catch {
          closed = true;
        }
      };

      const sendSnapshot = async () => {
        seq += 1;
        try {
          const overviewPayload = await fetchStockEngineJson(`/engine/cockpit?limit=${limit}`);
          let selectedPayload: any = null;

          if (symbol) {
            selectedPayload = await fetchStockEngineJson(
              `/engine/cockpit/symbol/${encodeURIComponent(symbol)}?include_candles=${includeCandles ? "true" : "false"}`,
            );
          }

          const selected = selectedPayload?.selected || overviewPayload?.value?.selected || null;
          const serverTime = new Date().toISOString();

          write("cockpit", {
            ok: true,
            type: "cockpit_sse_snapshot",
            streamModel: "s8_3_secure_stock_engine_proxy_v1",
            seq,
            serverTime,
            symbol: symbol || null,
            intervalMs,
            value: overviewPayload?.value || null,
            selected,
          });

          const timeline = selected?.aiPanel?.timeline || selected?.lifecycle?.timeline || [];
          const latestTimeline = Array.isArray(timeline) ? timeline[timeline.length - 1] : null;
          const lifecycleStatus =
            selected?.lifecycle?.lifecycleStatus ||
            selected?.signal?.lifecycleStatus ||
            selected?.status ||
            null;
          const eventType = latestTimeline?.type || lifecycleStatus || null;
          const at =
            latestTimeline?.at ||
            selected?.lifecycle?.evaluatedAt ||
            selected?.signal?.createdAt ||
            serverTime;
          const eventKey = selected?.symbol && eventType ? `${selected.symbol}|${eventType}|${at}` : "";

          if (eventKey && eventKey !== lastLifecycleEventKey) {
            lastLifecycleEventKey = eventKey;
            write("lifecycle", {
              ok: true,
              type: "lifecycle_event_bus_update",
              streamModel: "s8_3_secure_stock_engine_proxy_v1",
              seq,
              serverTime,
              eventKey,
              symbol: selected?.symbol || symbol || null,
              eventType,
              lifecycleStatus,
              at,
              text: latestTimeline?.text || selected?.aiPanel?.guidance?.[0] || null,
              guidance: selected?.aiPanel?.guidance || selected?.lifecycle?.guidance || [],
              nextActions: selected?.aiPanel?.nextActions || selected?.lifecycle?.nextActions || [],
              currentPrice:
                selected?.signal?.currentPrice ??
                selected?.lifecycle?.currentPrice ??
                selected?.chart?.snapshot?.latestPrice ??
                null,
              currentR: selected?.signal?.currentR ?? selected?.lifecycle?.currentR ?? null,
            });
          }
        } catch (error) {
          write("cockpit", {
            ok: false,
            type: "cockpit_sse_error",
            streamModel: "s8_3_secure_stock_engine_proxy_v1",
            seq,
            serverTime: new Date().toISOString(),
            symbol: symbol || null,
            error: error instanceof Error ? error.message : "Stock engine stream error",
            stockEngineBaseUrl: STOCK_ENGINE_BASE_URL,
          });
        }
      };

      write("hello", {
        ok: true,
        type: "cockpit_sse_connected",
        streamModel: "s8_3_secure_stock_engine_proxy_v1",
        serverTime: new Date().toISOString(),
        symbol: symbol || null,
        intervalMs,
      });

      void sendSnapshot();
      timer = setInterval(() => void sendSnapshot(), intervalMs);

      request.signal.addEventListener("abort", () => {
        closed = true;
        if (timer) clearInterval(timer);
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      closed = true;
      if (timer) clearInterval(timer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
