"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type TelegramStatus = {
  connected: boolean;
  subscription?: {
    username?: string | null;
    min_status?: string | null;
    asset_filter?: string | null;
  } | null;
};

async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  return fetch(input, {
    ...init,
    headers: {
      ...(init.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
    },
  });
}

export default function TelegramSignalsConnectButton() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadStatus() {
    const response = await authFetch("/api/telegram/signals/status");

    if (!response.ok) return;

    const payload = (await response.json()) as TelegramStatus;
    setStatus(payload);
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function handleConnect() {
    setLoading(true);
    setMessage(null);

    try {
      const response = await authFetch("/api/telegram/signals/connect-code", {
        method: "POST",
      });

      const payload = await response.json();

      if (!response.ok) {
        setMessage(payload.error || "Failed to create Telegram connection link.");
        return;
      }

      window.open(payload.deepLink, "_blank", "noopener,noreferrer");
      setMessage("Telegram opened. Press Start in the Signals bot, then return here.");

      window.setTimeout(loadStatus, 2500);
      window.setTimeout(loadStatus, 7000);
    } catch (error) {
      setMessage("Failed to open Telegram connection.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    setLoading(true);
    setMessage(null);

    try {
      const response = await authFetch("/api/telegram/signals/status", {
        method: "DELETE",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setMessage(payload?.error || "Failed to disconnect Telegram Alerts.");
        return;
      }

      setStatus({ connected: false, subscription: null });
      setMessage("Telegram Alerts disconnected.");
    } finally {
      setLoading(false);
    }
  }

  const connected = Boolean(status?.connected);

  return (
    <div className="rounded-3xl border border-cyan-200/15 bg-cyan-200/[0.06] p-4 shadow-[0_0_35px_rgba(34,211,238,0.08)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-100/55">
            Telegram Alerts
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">
            {connected ? "Telegram connected" : "Connect signal alerts"}
          </h3>
          <p className="mt-1 text-sm text-white/55">
            {connected
              ? `ACTIVE/ARMED signals will be sent to ${status?.subscription?.username || "your Telegram"}.`
              : "Receive ACTIVE and ARMED SkillEdge signals without pressing Scan market."}
          </p>
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={connected ? handleDisconnect : handleConnect}
          className="rounded-full border border-cyan-200/25 bg-cyan-300/15 px-4 py-2 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-300/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading
            ? "Please wait..."
            : connected
              ? "Disconnect"
              : "Connect Telegram"}
        </button>
      </div>

      {message ? <p className="mt-3 text-xs text-cyan-100/70">{message}</p> : null}
    </div>
  );
}
