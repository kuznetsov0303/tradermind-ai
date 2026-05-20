"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/security/client-auth-fetch";

type WithdrawalRequest = {
  id: string;
  user_id: string;
  amount_points: number;
  wallet_address: string;
  network: string;
  confirmation_email: string;
  status: "pending" | "paid" | "rejected" | "cancelled" | string;
  admin_note: string | null;
  created_at: string;
  processed_at: string | null;
};

function formatDateTime(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatPoints(value: number) {
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;

  return `${safeValue.toFixed(2).replace(/\.00$/, "")} pts`;
}

function getStatusClass(status: string) {
  if (status === "paid") {
    return "border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100";
  }

  if (status === "rejected") {
    return "border-rose-300/20 bg-rose-300/[0.08] text-rose-100";
  }

  return "border-amber-300/20 bg-amber-300/[0.08] text-amber-100";
}

export default function AdminReferralWithdrawalsPage() {
  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState("");
  const [error, setError] = useState("");
  const [adminNote, setAdminNote] = useState("");

  const pendingCount = useMemo(
    () => requests.filter((request) => request.status === "pending").length,
    [requests]
  );

  const pendingAmount = useMemo(
    () =>
      requests
        .filter((request) => request.status === "pending")
        .reduce((sum, request) => sum + Number(request.amount_points || 0), 0),
    [requests]
  );

  async function loadRequests() {
    setError("");
    setLoading(true);

    try {
      const response = await authFetch("/api/admin/referrals/withdrawals", {
        method: "GET",
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || "Failed to load requests");
      }

      setRequests((result.requests || []) as WithdrawalRequest[]);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load requests"
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(requestId: string, action: "paid" | "rejected") {
    const confirmed = window.confirm(
      action === "paid"
        ? "Подтвердить, что крипта реально выплачена клиенту?"
        : "Отклонить заявку? Баллы вернутся в available balance клиента."
    );

    if (!confirmed) return;

    setError("");
    setActionLoadingId(requestId);

    try {
      const response = await authFetch("/api/admin/referrals/withdrawals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requestId,
          action,
          adminNote,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || "Failed to update request");
      }

      setAdminNote("");
      await loadRequests();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Failed to update request"
      );
    } finally {
      setActionLoadingId("");
    }
  }

  useEffect(() => {
    loadRequests();
  }, []);

  return (
    <main className="min-h-screen bg-[#060a13] px-4 py-6 text-white md:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 shadow-[0_30px_120px_rgba(0,0,0,0.35)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-100/45">
                SkillEdge Admin
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-[-0.05em] md:text-5xl">
                Referral Withdrawals
              </h1>
              <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-white/50">
                Тут подтверждаются заявки на вывод referral points. Нажимай Paid
                только после фактической выплаты криптой.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/dashboard"
                className="rounded-full border border-cyan-200/16 bg-cyan-200/[0.07] px-5 py-3 text-sm font-black text-cyan-50 transition hover:bg-cyan-200/[0.12]"
              >
                Dashboard
              </Link>

              <button
                type="button"
                onClick={loadRequests}
                className="rounded-full bg-white px-5 py-3 text-sm font-black text-[#06111d] transition hover:-translate-y-0.5"
              >
                Refresh
              </button>
            </div>
          </div>
        </header>

        <section className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="rounded-[1.6rem] border border-amber-300/14 bg-amber-300/[0.06] p-5">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-100/50">
              Pending requests
            </p>
            <div className="mt-3 text-4xl font-black">{pendingCount}</div>
          </div>

          <div className="rounded-[1.6rem] border border-cyan-300/14 bg-cyan-300/[0.06] p-5">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-100/50">
              Pending amount
            </p>
            <div className="mt-3 text-4xl font-black">
              {formatPoints(pendingAmount)}
            </div>
          </div>

          <div className="rounded-[1.6rem] border border-white/10 bg-white/[0.04] p-5">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-white/35">
              Security
            </p>
            <div className="mt-3 text-sm font-bold leading-6 text-white/60">
              Доступ только для email из SKILLEDGE_ADMIN_EMAILS. Обновление
              идёт через server route + service role.
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 shadow-[0_30px_120px_rgba(0,0,0,0.28)]">
          <div className="mb-4">
            <label className="block">
              <span className="text-xs font-black uppercase tracking-[0.2em] text-white/35">
                Admin note
              </span>
              <input
                value={adminNote}
                onChange={(event) => setAdminNote(event.target.value)}
                placeholder="Например: Paid manually via USDT TRC20"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/24 px-4 py-3 text-sm font-semibold text-white outline-none placeholder:text-white/25 focus:border-cyan-200/35"
              />
            </label>
          </div>

          {error ? (
            <div className="mb-4 rounded-2xl border border-rose-300/18 bg-rose-300/[0.08] px-4 py-3 text-sm font-bold text-rose-100">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-8 text-center text-sm font-bold text-white/55">
              Loading withdrawal requests...
            </div>
          ) : requests.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-8 text-center text-sm font-bold text-white/55">
              Пока нет заявок на вывод.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] border-separate border-spacing-y-3 text-left">
                <thead>
                  <tr className="text-xs font-black uppercase tracking-[0.18em] text-white/35">
                    <th className="px-3 py-2">Created</th>
                    <th className="px-3 py-2">Amount</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Network</th>
                    <th className="px-3 py-2">Wallet</th>
                    <th className="px-3 py-2">Processed</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {requests.map((request) => (
                    <tr
                      key={request.id}
                      className="rounded-2xl border border-white/10 bg-black/20 text-sm"
                    >
                      <td className="rounded-l-2xl px-3 py-4 text-white/60">
                        {formatDateTime(request.created_at)}
                      </td>

                      <td className="px-3 py-4 font-black text-white">
                        {formatPoints(Number(request.amount_points))}
                      </td>

                      <td className="px-3 py-4">
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.14em] ${getStatusClass(
                            request.status
                          )}`}
                        >
                          {request.status}
                        </span>
                      </td>

                      <td className="px-3 py-4 text-white/70">
                        {request.confirmation_email}
                      </td>

                      <td className="px-3 py-4 font-bold text-cyan-100/80">
                        {request.network}
                      </td>

                      <td className="max-w-[260px] px-3 py-4">
                        <div className="truncate font-mono text-xs text-white/55">
                          {request.wallet_address}
                        </div>
                      </td>

                      <td className="px-3 py-4 text-white/45">
                        {formatDateTime(request.processed_at)}
                      </td>

                      <td className="rounded-r-2xl px-3 py-4">
                        {request.status === "pending" ? (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={actionLoadingId === request.id}
                              onClick={() => handleAction(request.id, "paid")}
                              className="rounded-full bg-emerald-200 px-4 py-2 text-xs font-black text-emerald-950 transition hover:-translate-y-0.5 disabled:opacity-50"
                            >
                              Paid
                            </button>

                            <button
                              type="button"
                              disabled={actionLoadingId === request.id}
                              onClick={() =>
                                handleAction(request.id, "rejected")
                              }
                              className="rounded-full border border-rose-300/20 bg-rose-300/[0.08] px-4 py-2 text-xs font-black text-rose-100 transition hover:bg-rose-300/[0.12] disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs font-bold text-white/35">
                            Done
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}