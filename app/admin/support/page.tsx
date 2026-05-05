"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type SupportSession = {
  id: string;
  user_id: string | null;
  customer_email: string | null;
  anonymous_id: string | null;
  language: string;
  page_url: string | null;
  status: string;
  last_message: string | null;
  operator_requested: boolean;
  operator_requested_at: string | null;
  assigned_operator_email: string | null;
  created_at: string;
  updated_at: string;
};

type SupportMessage = {
  id: string;
  session_id: string;
  sender_type: "user" | "assistant" | "operator" | "system";
  sender_name: string | null;
  message_text: string;
  created_at: string;
};

function formatDate(value?: string | null) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function AdminSupportPage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [sessions, setSessions] = useState<SupportSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [selectedSession, setSelectedSession] = useState<SupportSession | null>(
    null
  );
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [reply, setReply] = useState("");
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [closingChat, setClosingChat] = useState(false);
  const [error, setError] = useState("");

  const activeSessions = useMemo(() => {
    return sessions.filter((session) => session.status !== "closed");
  }, [sessions]);

  const selectedSessionFromList = useMemo(() => {
    return sessions.find((session) => session.id === selectedSessionId) || null;
  }, [sessions, selectedSessionId]);

  const getAccessToken = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.access_token || "";
  };

  const loadSessions = async () => {
    try {
      setError("");
      setLoadingSessions(true);

      const accessToken = await getAccessToken();

      if (!accessToken) {
        setError("Войди в админ-аккаунт, чтобы открыть поддержку.");
        return;
      }

      const response = await fetch("/api/support/admin/sessions", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data?.error || "Не удалось загрузить чаты.");
        return;
      }

      const loadedSessions = data.sessions || [];

      setSessions(loadedSessions);

      const params = new URLSearchParams(window.location.search);
      const sessionFromUrl = params.get("session");

      if (sessionFromUrl) {
        setSelectedSessionId(sessionFromUrl);
        return;
      }

      if (!selectedSessionId && loadedSessions[0]?.id) {
        setSelectedSessionId(loadedSessions[0].id);
      }
    } catch {
      setError("Не удалось загрузить чаты.");
    } finally {
      setLoadingSessions(false);
      setAuthChecked(true);
    }
  };

  const loadMessages = async (sessionId: string) => {
    try {
      if (!sessionId) {
        return;
      }

      setError("");
      setLoadingMessages(true);

      const accessToken = await getAccessToken();

      if (!accessToken) {
        setError("Войди в админ-аккаунт.");
        return;
      }

      const response = await fetch(
        `/api/support/admin/messages?sessionId=${sessionId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data?.error || "Не удалось загрузить сообщения.");
        return;
      }

      setSelectedSession(data.session);
      setMessages(data.messages || []);
    } catch {
      setError("Не удалось загрузить сообщения.");
    } finally {
      setLoadingMessages(false);
    }
  };

  const sendReply = async () => {
    try {
      const text = reply.trim();

      if (!selectedSessionId || !text) {
        return;
      }

      setError("");
      setSendingReply(true);

      const accessToken = await getAccessToken();

      if (!accessToken) {
        setError("Войди в админ-аккаунт.");
        return;
      }

      const response = await fetch("/api/support/admin/reply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          sessionId: selectedSessionId,
          message: text,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data?.error || "Не удалось отправить ответ.");
        return;
      }

      setReply("");
      await loadMessages(selectedSessionId);
      await loadSessions();
    } catch {
      setError("Не удалось отправить ответ.");
    } finally {
      setSendingReply(false);
    }
  };

  const closeChat = async () => {
    try {
      if (!selectedSessionId) {
        return;
      }

      setError("");
      setClosingChat(true);

      const accessToken = await getAccessToken();

      if (!accessToken) {
        setError("Войди в админ-аккаунт.");
        return;
      }

      const response = await fetch("/api/support/admin/close", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          sessionId: selectedSessionId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data?.error || "Не удалось закрыть чат.");
        return;
      }

      await loadSessions();
      await loadMessages(selectedSessionId);
    } catch {
      setError("Не удалось закрыть чат.");
    } finally {
      setClosingChat(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    if (selectedSessionId) {
      loadMessages(selectedSessionId);
    }
  }, [selectedSessionId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      loadSessions();

      if (selectedSessionId) {
        loadMessages(selectedSessionId);
      }
    }, 4000);

    return () => window.clearInterval(interval);
  }, [selectedSessionId]);

  return (
    <main className="min-h-screen bg-[#050914] px-5 py-8 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-cyan-100/45">
              SkillEdge Admin
            </div>

            <h1 className="mt-3 text-3xl font-semibold tracking-tight">
              Support chats
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">
              Здесь ты видишь запросы клиентов, открываешь конкретную сессию и
              отвечаешь прямо в чат на сайте.
            </p>
          </div>

          <button
            type="button"
            onClick={loadSessions}
            className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm text-white/75 transition hover:bg-white/10"
          >
            Обновить
          </button>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100/80">
            {error}
          </div>
        )}

        {!authChecked && loadingSessions ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-white/50">
            Загружаю поддержку...
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
            <aside className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.22em] text-white/35">
                    Очередь
                  </div>
                  <div className="mt-1 text-sm text-white/60">
                    Открыто: {activeSessions.length}
                  </div>
                </div>
              </div>

              <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
                {sessions.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/45">
                    Пока нет support-чатов.
                  </div>
                ) : (
                  sessions.map((session) => {
                    const isActive = session.id === selectedSessionId;

                    return (
                      <button
                        key={session.id}
                        type="button"
                        onClick={() => setSelectedSessionId(session.id)}
                        className={`w-full rounded-2xl border p-4 text-left transition ${
                          isActive
                            ? "border-cyan-300/40 bg-cyan-300/10"
                            : "border-white/10 bg-black/20 hover:bg-white/[0.05]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-white">
                              {session.customer_email || "Anonymous visitor"}
                            </div>

                            <div className="mt-1 truncate text-xs text-white/40">
                              {session.id}
                            </div>
                          </div>

                          <span
                            className={`rounded-full px-2.5 py-1 text-[11px] ${
                              session.status === "closed"
                                ? "bg-white/10 text-white/45"
                                : session.operator_requested
                                  ? "bg-amber-300/15 text-amber-100"
                                  : "bg-emerald-300/15 text-emerald-100"
                            }`}
                          >
                            {session.status}
                          </span>
                        </div>

                        <div className="mt-3 truncate text-sm leading-5 text-white/55">
                          {session.last_message || "Нет сообщений"}
                        </div>

                        <div className="mt-3 text-xs text-white/30">
                          {formatDate(session.updated_at)}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </aside>

            <section className="rounded-[2rem] border border-white/10 bg-white/[0.035]">
              {selectedSession || selectedSessionFromList ? (
                <>
                  <div className="border-b border-white/10 p-5">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="text-xs uppercase tracking-[0.22em] text-cyan-100/45">
                          Активный чат
                        </div>

                        <div className="mt-2 text-xl font-semibold">
                          {(selectedSession || selectedSessionFromList)
                            ?.customer_email || "Anonymous visitor"}
                        </div>

                        <div className="mt-2 max-w-2xl break-all text-xs leading-5 text-white/45">
                          Session:{" "}
                          {(selectedSession || selectedSessionFromList)?.id}
                          <br />
                          User:{" "}
                          {(selectedSession || selectedSessionFromList)
                            ?.user_id || "No user_id"}
                          <br />
                          Anonymous:{" "}
                          {(selectedSession || selectedSessionFromList)
                            ?.anonymous_id || "No anonymous_id"}
                          <br />
                          Page:{" "}
                          {(selectedSession || selectedSessionFromList)
                            ?.page_url || "—"}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={closeChat}
                        disabled={closingChat}
                        className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm text-white/70 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {closingChat ? "Закрываю..." : "Закрыть чат"}
                      </button>
                    </div>
                  </div>

                  <div className="max-h-[58vh] space-y-3 overflow-y-auto p-5">
                    {loadingMessages ? (
                      <div className="text-sm text-white/40">
                        Загружаю сообщения...
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/45">
                        В этом чате пока нет сообщений.
                      </div>
                    ) : (
                      messages.map((message) => (
                        <div
                          key={message.id}
                          className={`flex ${
                            message.sender_type === "operator"
                              ? "justify-end"
                              : "justify-start"
                          }`}
                        >
                          <div
                            className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                              message.sender_type === "operator"
                                ? "bg-cyan-300 text-black"
                                : message.sender_type === "user"
                                  ? "border border-white/10 bg-white/[0.06] text-white/80"
                                  : message.sender_type === "system"
                                    ? "border border-emerald-300/20 bg-emerald-400/10 text-emerald-50/75"
                                    : "border border-white/10 bg-black/25 text-white/60"
                            }`}
                          >
                            <div className="mb-1 text-[11px] opacity-60">
                              {message.sender_name || message.sender_type} ·{" "}
                              {formatDate(message.created_at)}
                            </div>
                            {message.message_text}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="border-t border-white/10 p-5">
                    <div className="flex gap-3">
                      <textarea
                        value={reply}
                        onChange={(event) => setReply(event.target.value)}
                        placeholder="Напиши ответ клиенту..."
                        rows={2}
                        className="min-h-[52px] flex-1 resize-none rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-cyan-300/40"
                      />

                      <button
                        type="button"
                        onClick={sendReply}
                        disabled={sendingReply || !reply.trim()}
                        className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {sendingReply ? "..." : "Ответить"}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-8 text-white/45">Выбери чат слева.</div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}