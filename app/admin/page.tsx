"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/security/client-auth-fetch";
import AdminActivationStatsBlock, {
  emptyActivationStatsResponse,
  type ActivationStatsResponse,
} from "@/components/admin/AdminActivationStatsBlock";

type SupportSession = {
  id: string;
  status: string;
};

type WithdrawalRequest = {
  id: string;
  user_id: string;
  amount_points: number;
  wallet_address: string;
  network: string;
  confirmation_email: string;
  status: string;
  admin_note: string | null;
  created_at: string;
  processed_at: string | null;
};

function formatPoints(value: number) {
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;
  return `${safeValue.toFixed(2).replace(/\.00$/, "")} pts`;
}

function AdminStatCard({
  label,
  value,
  text,
}: {
  label: string;
  value: string;
  text: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-[1.7rem] border border-white/10 bg-white/[0.045] p-5">
      <div className="pointer-events-none absolute -right-12 -top-12 h-28 w-28 rounded-full bg-cyan-300/10 blur-3xl" />
      <div className="relative">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-white/35">
          {label}
        </p>
        <div className="mt-3 text-3xl font-black tracking-[-0.05em] text-white">
          {value}
        </div>
        <p className="mt-2 text-sm font-semibold leading-6 text-white/48">
          {text}
        </p>
      </div>
    </div>
  );
}

function AdminHubCard({
  label,
  title,
  text,
  href,
  status,
  disabled,
}: {
  label: string;
  title: string;
  text: string;
  href: string;
  status: string;
  disabled?: boolean;
}) {
  const content = (
    <div
      className={`group relative h-full overflow-hidden rounded-[2rem] border p-5 transition ${
        disabled
          ? "border-white/10 bg-white/[0.025] opacity-65"
          : "border-cyan-200/12 bg-cyan-200/[0.045] hover:-translate-y-1 hover:border-cyan-200/26 hover:bg-cyan-200/[0.07]"
      }`}
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-36 w-36 rounded-full bg-cyan-300/0 blur-3xl transition group-hover:bg-cyan-300/12" />
      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-100/50">
            {label}
          </p>

          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white/45">
            {status}
          </span>
        </div>

        <h2 className="mt-4 text-2xl font-black tracking-[-0.05em] text-white">
          {title}
        </h2>

        <p className="mt-3 min-h-[72px] text-sm font-semibold leading-6 text-white/50">
          {text}
        </p>

        <div className="mt-5 inline-flex rounded-full bg-white px-5 py-3 text-sm font-black text-[#06111d] transition group-hover:-translate-y-0.5">
          {disabled ? "Coming soon" : "Open"}
        </div>
      </div>
    </div>
  );

  if (disabled) return content;

  return (
    <Link href={href} className="block h-full">
      {content}
    </Link>
  );
}

export default function AdminHubPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);
  const [supportSessions, setSupportSessions] = useState<SupportSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activationStats, setActivationStats] =
  useState<ActivationStatsResponse>(emptyActivationStatsResponse);
const [activationStatsLoading, setActivationStatsLoading] = useState(false);


const openSupportChats = useMemo(
  () => supportSessions.filter((session) => session.status !== "closed").length,
  [supportSessions]
);
  const pendingRequests = useMemo(
    () => requests.filter((request) => request.status === "pending"),
    [requests]
  );

  const pendingAmount = useMemo(
    () =>
      pendingRequests.reduce(
        (sum, request) => sum + Number(request.amount_points || 0),
        0
      ),
    [pendingRequests]
  );

  async function loadAdminHub() {
    setLoading(true);
    setError("");

    try {
      const adminResponse = await authFetch("/api/admin/me", {
        method: "GET",
      });

      const adminResult = await adminResponse.json().catch(() => ({}));
      const admin = Boolean(adminResult.isAdmin);

      setIsAdmin(admin);

      if (!admin) return;

      setActivationStatsLoading(true);

try {
  const activationResponse = await authFetch("/api/admin/stats/activations", {
    method: "GET",
  });

  const activationResult = await activationResponse.json().catch(() => ({}));

  if (activationResponse.ok) {
    setActivationStats({
      stats: activationResult.stats || emptyActivationStatsResponse.stats,
      totals: activationResult.totals || emptyActivationStatsResponse.totals,
      updatedAt: activationResult.updatedAt || null,
    });
  }
} finally {
  setActivationStatsLoading(false);
}

try {
  const supportResponse = await authFetch("/api/support/admin/sessions", {
    method: "GET",
  });

  const supportResult = await supportResponse.json().catch(() => ({}));

  if (supportResponse.ok) {
    setSupportSessions((supportResult.sessions || []) as SupportSession[]);
  }
} catch {
  setSupportSessions([]);
}

      const withdrawalsResponse = await authFetch(
        "/api/admin/referrals/withdrawals",
        {
          method: "GET",
        }
      );

      const withdrawalsResult = await withdrawalsResponse
        .json()
        .catch(() => ({}));

      if (!withdrawalsResponse.ok) {
        throw new Error(
          withdrawalsResult.error || "Failed to load admin dashboard"
        );
      }

      setRequests((withdrawalsResult.requests || []) as WithdrawalRequest[]);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load admin dashboard"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAdminHub();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  if (loading || isAdmin === null) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#060a13] px-4 text-white">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 text-center shadow-[0_30px_120px_rgba(0,0,0,0.35)]">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-100/45">
            SkillEdge Admin
          </p>
          <h1 className="mt-3 text-3xl font-black">Loading admin hub...</h1>
        </div>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#060a13] px-4 text-white">
        <div className="max-w-xl rounded-[2rem] border border-rose-300/16 bg-rose-300/[0.05] p-8 text-center shadow-[0_30px_120px_rgba(0,0,0,0.35)]">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-rose-100/55">
            Access denied
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.05em]">
            Admin access only
          </h1>
          <p className="mt-4 text-sm font-semibold leading-6 text-white/52">
            This area is available only for emails listed in SKILLEDGE_ADMIN_EMAILS.
          </p>

          <Link
            href="/dashboard"
            className="mt-6 inline-flex rounded-full bg-white px-6 py-3 text-sm font-black text-[#06111d] transition hover:-translate-y-0.5"
          >
            Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#060a13] px-4 py-6 text-white md:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="relative overflow-hidden rounded-[2.4rem] border border-white/10 bg-white/[0.045] p-6 shadow-[0_30px_120px_rgba(0,0,0,0.35)] md:p-8">
          <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-cyan-300/12 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-20 h-56 w-56 rounded-full bg-emerald-300/10 blur-3xl" />

          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-100/45">
                SkillEdge Admin Hub
              </p>
              <h1 className="mt-3 text-4xl font-black tracking-[-0.06em] md:text-6xl">
                Control center
              </h1>
              <p className="mt-4 max-w-2xl text-sm font-semibold leading-7 text-white/52">
                Р В Р’В Р В РІвЂљВ¬Р В Р’В Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’В°Р В Р’В Р В РІР‚В Р В Р’В Р вЂ™Р’В»Р В Р’В Р вЂ™Р’ВµР В Р’В Р В РІР‚В¦Р В Р’В Р РЋРІР‚ВР В Р’В Р вЂ™Р’Вµ Р В Р’В Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В Р’В Р В РІР‚В Р В Р’В Р РЋРІР‚СћР В Р’В Р СћРІР‚ВР В Р’В Р вЂ™Р’В°Р В Р’В Р РЋР’ВР В Р’В Р РЋРІР‚В referral points, support-Р В Р’В Р вЂ™Р’В·Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р В Р РЏР В Р’В Р В РІР‚В Р В Р’В Р РЋРІР‚СњР В Р’В Р вЂ™Р’В°Р В Р’В Р РЋР’ВР В Р’В Р РЋРІР‚В, Р В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚СћР В Р’В Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В Р’В Р вЂ™Р’В·Р В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’ВµР В Р’В Р вЂ™Р’В»Р В Р Р‹Р В Р РЏР В Р’В Р РЋР’ВР В Р’В Р РЋРІР‚В,
                Р В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚СћР В Р’В Р СћРІР‚ВР В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В Р’В Р РЋРІР‚СњР В Р’В Р вЂ™Р’В°Р В Р’В Р РЋР’ВР В Р’В Р РЋРІР‚В Р В Р’В Р РЋРІР‚В Р В Р’В Р РЋРІР‚вЂќР В Р’В Р вЂ™Р’В»Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’ВµР В Р’В Р вЂ™Р’В¶Р В Р’В Р В РІР‚В¦Р В Р’В Р РЋРІР‚СћР В Р’В Р Р†РІР‚С›РІР‚вЂњ Р В Р Р‹Р В РЎвЂњР В Р’В Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’ВµР В Р’В Р РЋР’ВР В Р’В Р РЋРІР‚СћР В Р’В Р Р†РІР‚С›РІР‚вЂњ.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={loadAdminHub}
                className="rounded-full border border-cyan-200/18 bg-cyan-200/[0.07] px-5 py-3 text-sm font-black text-cyan-50 transition hover:bg-cyan-200/[0.12]"
              >
                Refresh
              </button>

              <Link
                href="/dashboard"
                className="rounded-full bg-white px-5 py-3 text-sm font-black text-[#06111d] transition hover:-translate-y-0.5"
              >
                Dashboard
              </Link>
            </div>
          </div>
        </header>

        {error ? (
          <div className="mt-5 rounded-2xl border border-rose-300/18 bg-rose-300/[0.08] px-4 py-3 text-sm font-bold text-rose-100">
            {error}
          </div>
        ) : null}

        <section className="mt-5 grid gap-4 md:grid-cols-3">
          <AdminStatCard
            label="Pending withdrawals"
            value={String(pendingRequests.length)}
            text="Р В Р’В Р Р†Р вЂљРІР‚СњР В Р’В Р вЂ™Р’В°Р В Р Р‹Р В Р РЏР В Р’В Р В РІР‚В Р В Р’В Р РЋРІР‚СњР В Р’В Р РЋРІР‚В, Р В Р’В Р РЋРІР‚СњР В Р’В Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В Р’В Р вЂ™Р’Вµ Р В Р’В Р вЂ™Р’В¶Р В Р’В Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљРЎв„ў Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљР Р‹Р В Р’В Р В РІР‚В¦Р В Р’В Р РЋРІР‚СћР В Р’В Р Р†РІР‚С›РІР‚вЂњ Р В Р’В Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В Р’В Р РЋРІР‚вЂќР В Р’В Р вЂ™Р’В»Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В Р’В Р РЋРІР‚СњР В Р Р‹Р В РІР‚С™Р В Р’В Р РЋРІР‚ВР В Р’В Р РЋРІР‚вЂќР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р РЋРІР‚СћР В Р’В Р Р†РІР‚С›РІР‚вЂњ."
          />

          <AdminStatCard
            label="Pending amount"
            value={formatPoints(pendingAmount)}
            text="Р В Р’В Р В Р вЂ№Р В Р Р‹Р РЋРІР‚СљР В Р’В Р РЋР’ВР В Р’В Р РЋР’ВР В Р’В Р вЂ™Р’В° points, Р В Р’В Р вЂ™Р’В·Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’ВµР В Р’В Р вЂ™Р’В·Р В Р’В Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В Р’В Р В РІР‚В Р В Р’В Р РЋРІР‚ВР В Р Р‹Р В РІР‚С™Р В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В Р В Р’В Р вЂ™Р’В°Р В Р’В Р В РІР‚В¦Р В Р’В Р В РІР‚В¦Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р В Р РЏ Р В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚СћР В Р’В Р СћРІР‚В pending-Р В Р’В Р вЂ™Р’В·Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р В Р РЏР В Р’В Р В РІР‚В Р В Р’В Р РЋРІР‚СњР В Р’В Р РЋРІР‚В."
          />

          <AdminStatCard
            label="Total requests"
            value={String(requests.length)}
            text="Р В Р’В Р РЋРЎСџР В Р’В Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В Р’В Р вЂ™Р’В»Р В Р’В Р вЂ™Р’ВµР В Р’В Р СћРІР‚ВР В Р’В Р В РІР‚В¦Р В Р’В Р РЋРІР‚ВР В Р’В Р вЂ™Р’Вµ referral withdrawal requests Р В Р’В Р В РІР‚В  Р В Р Р‹Р В РЎвЂњР В Р’В Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’ВµР В Р’В Р РЋР’ВР В Р’В Р вЂ™Р’Вµ."
          />
        </section>

<AdminActivationStatsBlock
  stats={activationStats}
  loading={activationStatsLoading}
  onRefresh={loadAdminHub}
/>

        <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <AdminHubCard
            label="Money"
            title="Referral Withdrawals"
            text="Р В Р’В Р РЋРЎСџР В Р’В Р РЋРІР‚СћР В Р’В Р СћРІР‚ВР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р В РІР‚В Р В Р’В Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’В¶Р В Р’В Р СћРІР‚ВР В Р’В Р вЂ™Р’В°Р В Р’В Р Р†РІР‚С›РІР‚вЂњ Р В Р’В Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В Р’В Р РЋРІР‚вЂќР В Р’В Р вЂ™Р’В»Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“: Paid Р В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В Р’В Р вЂ™Р’В»Р В Р’В Р вЂ™Р’Вµ Р В Р Р‹Р Р†Р вЂљРЎвЂєР В Р’В Р вЂ™Р’В°Р В Р’В Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљР Р‹Р В Р’В Р вЂ™Р’ВµР В Р Р‹Р В РЎвЂњР В Р’В Р РЋРІР‚СњР В Р’В Р РЋРІР‚СћР В Р’В Р Р†РІР‚С›РІР‚вЂњ Р В Р’В Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’В°Р В Р’В Р В РІР‚В Р В Р’В Р РЋРІР‚СњР В Р’В Р РЋРІР‚В Р В Р’В Р РЋРІР‚СњР В Р Р‹Р В РІР‚С™Р В Р’В Р РЋРІР‚ВР В Р’В Р РЋРІР‚вЂќР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“, Reject Р В Р’В Р вЂ™Р’ВµР В Р Р‹Р В РЎвЂњР В Р’В Р вЂ™Р’В»Р В Р’В Р РЋРІР‚В Р В Р’В Р вЂ™Р’В·Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р В Р РЏР В Р’В Р В РІР‚В Р В Р’В Р РЋРІР‚СњР В Р’В Р вЂ™Р’В° Р В Р’В Р В РІР‚В¦Р В Р’В Р вЂ™Р’ВµР В Р’В Р В РІР‚В Р В Р’В Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В Р’В Р В РІР‚В¦Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р В Р РЏ."
            href="/admin/referrals"
            status={pendingRequests.length ? `${pendingRequests.length} pending` : "ready"}
          />

          <AdminHubCard
            label="Support"
            title="Support Widget Chats"
            text="Р В Р’В Р РЋРІР‚С”Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р РЋРІР‚СњР В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В Р’В Р В РІР‚В Р В Р’В Р вЂ™Р’В°Р В Р’В Р Р†РІР‚С›РІР‚вЂњ Р В Р’В Р РЋРІР‚СњР В Р’В Р вЂ™Р’В»Р В Р’В Р РЋРІР‚ВР В Р’В Р вЂ™Р’ВµР В Р’В Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РЎвЂњР В Р’В Р РЋРІР‚СњР В Р’В Р РЋРІР‚ВР В Р’В Р вЂ™Р’Вµ Р В Р’В Р РЋРІР‚СћР В Р’В Р вЂ™Р’В±Р В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР’В°Р В Р’В Р вЂ™Р’ВµР В Р’В Р В РІР‚В¦Р В Р’В Р РЋРІР‚ВР В Р Р‹Р В Р РЏ Р В Р’В Р РЋРІР‚ВР В Р’В Р вЂ™Р’В· floating support assistant, Р В Р Р‹Р В РЎвЂњР В Р’В Р РЋР’ВР В Р’В Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РІР‚С™Р В Р’В Р РЋРІР‚В Р В Р’В Р вЂ™Р’В°Р В Р’В Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р РЋРІР‚ВР В Р’В Р В РІР‚В Р В Р’В Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В Р’В Р вЂ™Р’Вµ Р В Р Р‹Р В РЎвЂњР В Р’В Р вЂ™Р’ВµР В Р Р‹Р В РЎвЂњР В Р Р‹Р В РЎвЂњР В Р’В Р РЋРІР‚ВР В Р’В Р РЋРІР‚В Р В Р’В Р РЋРІР‚В Р В Р’В Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р В РІР‚В Р В Р’В Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљР Р‹Р В Р’В Р вЂ™Р’В°Р В Р’В Р Р†РІР‚С›РІР‚вЂњ Р В Р’В Р РЋРІР‚СњР В Р’В Р вЂ™Р’В»Р В Р’В Р РЋРІР‚ВР В Р’В Р вЂ™Р’ВµР В Р’В Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚Сљ Р В Р’В Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В Р Р‹Р В Р РЏР В Р’В Р РЋР’ВР В Р’В Р РЋРІР‚Сћ Р В Р’В Р РЋРІР‚ВР В Р’В Р вЂ™Р’В· Р В Р’В Р вЂ™Р’В°Р В Р’В Р СћРІР‚ВР В Р’В Р РЋР’ВР В Р’В Р РЋРІР‚ВР В Р’В Р В РІР‚В¦Р В Р’В Р РЋРІР‚СњР В Р’В Р РЋРІР‚В."
            href="/admin/support"
            status={openSupportChats > 0 ? `${openSupportChats} open` : "live"}
/>

          <AdminHubCard
            label="Users"
            title="Users & Subscriptions"
            text="Р В Р’В Р Р†Р вЂљР’ВР В Р Р‹Р РЋРІР‚СљР В Р’В Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљР’В°Р В Р’В Р РЋРІР‚ВР В Р’В Р Р†РІР‚С›РІР‚вЂњ Р В Р’В Р вЂ™Р’В±Р В Р’В Р вЂ™Р’В»Р В Р’В Р РЋРІР‚СћР В Р’В Р РЋРІР‚Сњ Р В Р’В Р СћРІР‚ВР В Р’В Р вЂ™Р’В»Р В Р Р‹Р В Р РЏ Р В Р’В Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В Р В Р’В Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В Р’В Р РЋРІР‚СњР В Р’В Р РЋРІР‚В Р В Р’В Р РЋРІР‚СњР В Р’В Р вЂ™Р’В»Р В Р’В Р РЋРІР‚ВР В Р’В Р вЂ™Р’ВµР В Р’В Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В , Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р’В Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљРЎвЂєР В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В , demo-Р В Р’В Р СћРІР‚ВР В Р’В Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚СљР В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В , Р В Р’В Р вЂ™Р’В»Р В Р’В Р РЋРІР‚ВР В Р’В Р РЋР’ВР В Р’В Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В , Р В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В РЎвЂњР В Р’В Р вЂ™Р’В° Р В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚СћР В Р’В Р СћРІР‚ВР В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В Р’В Р РЋРІР‚СњР В Р’В Р РЋРІР‚В Р В Р’В Р РЋРІР‚В Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљР Р‹Р В Р’В Р В РІР‚В¦Р В Р’В Р РЋРІР‚СћР В Р’В Р Р†РІР‚С›РІР‚вЂњ Р В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚СћР В Р’В Р РЋР’ВР В Р’В Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљР’В°Р В Р’В Р РЋРІР‚В."
            href="/admin/users"
            status="planned"
            disabled
          />

          <AdminHubCard
            label="Payments"
            title="Payments & Webhooks"
            text="Р В Р’В Р Р†Р вЂљР’ВР В Р Р‹Р РЋРІР‚СљР В Р’В Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљР’В°Р В Р’В Р РЋРІР‚ВР В Р’В Р Р†РІР‚С›РІР‚вЂњ Р В Р’В Р вЂ™Р’В±Р В Р’В Р вЂ™Р’В»Р В Р’В Р РЋРІР‚СћР В Р’В Р РЋРІР‚Сњ Р В Р’В Р СћРІР‚ВР В Р’В Р вЂ™Р’В»Р В Р Р‹Р В Р РЏ Р В Р’В Р РЋРІР‚СњР В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РІР‚С™Р В Р’В Р РЋРІР‚СћР В Р’В Р вЂ™Р’В»Р В Р Р‹Р В Р РЏ Р В Р’В Р РЋРІР‚СћР В Р’В Р РЋРІР‚вЂќР В Р’В Р вЂ™Р’В»Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ў, crypto invoices, webhook events, failed payments Р В Р’В Р РЋРІР‚В referral reward Р В Р’В Р В РІР‚В¦Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР Р‹Р В Р’В Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В Р’В Р вЂ™Р’В»Р В Р’В Р вЂ™Р’ВµР В Р’В Р В РІР‚В¦Р В Р’В Р РЋРІР‚ВР В Р’В Р Р†РІР‚С›РІР‚вЂњ."
            href="/admin/payments"
            status="planned"
            disabled
          />
          <AdminHubCard
            label="Signals"
            title="Signal Review Queue"
            text="Internal manual approval queue: ready-for-review, blocked research-only candidates, and approve/reject history."
            href="/admin/signals-review"
            status="manual gate"
          />


          <a
            href="/admin/investor-dashboard"
            className="group relative overflow-hidden rounded-[28px] border border-white/10 bg-[#0C1522] p-6 text-left transition hover:-translate-y-0.5 hover:border-emerald-400/30 hover:bg-[#0F1B2A]"
          >
            <div className="mb-5 flex items-center justify-between gap-3">
              <span className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                Investor
              </span>
              <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-emerald-200">
                Ready
              </span>
            </div>

            <h3 className="text-[22px] font-black tracking-tight text-white">
              Investor Dashboard
            </h3>

            <p className="mt-4 max-w-sm text-[14px] leading-6 text-slate-400">
              Р В Р’В Р вЂ™Р’ВР В Р’В Р В РІР‚В¦Р В Р’В Р В РІР‚В Р В Р’В Р вЂ™Р’ВµР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В Р Р‹Р В РЎвЂњР В Р’В Р РЋРІР‚СњР В Р’В Р вЂ™Р’В°Р В Р Р‹Р В Р РЏ Р В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р РЋРІР‚ВР В Р’В Р РЋРІР‚СњР В Р’В Р вЂ™Р’В°: Р В Р Р‹Р Р†Р вЂљР’В Р В Р’В Р вЂ™Р’ВµР В Р’В Р В РІР‚В¦Р В Р’В Р В РІР‚В¦Р В Р’В Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ° Р В Р’В Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В Р’В Р РЋРІР‚СћР В Р’В Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р’В Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’В°, AI learning, win rate,
              PnL simulation, Р В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’ВµР В Р’В Р РЋРІР‚вЂњР В Р’В Р РЋРІР‚ВР В Р’В Р РЋРІР‚В, readiness Р В Р’В Р РЋРІР‚В Р В Р’В Р РЋР’ВР В Р’В Р вЂ™Р’В°Р В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†РІР‚С™Р’В¬Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’В°Р В Р’В Р вЂ™Р’В±Р В Р’В Р РЋРІР‚ВР В Р Р‹Р В РІР‚С™Р В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В Р В Р’В Р вЂ™Р’В°Р В Р’В Р В РІР‚В¦Р В Р’В Р РЋРІР‚ВР В Р’В Р вЂ™Р’Вµ.
            </p>

            <div className="mt-7 inline-flex rounded-full bg-white px-5 py-3 text-[13px] font-black text-[#07111F]">
              Open
            </div>
          </a>

          <AdminHubCard
            label="Security"
            title="Admin Access"
            text="Р В Р’В Р Р†Р вЂљРЎСљР В Р’В Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚СљР В Р’В Р РЋРІР‚вЂќ Р В Р’В Р РЋРІР‚Сњ Р В Р Р‹Р В Р Р‰Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р РЋРІР‚СћР В Р’В Р Р†РІР‚С›РІР‚вЂњ Р В Р’В Р вЂ™Р’В·Р В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В¦Р В Р’В Р вЂ™Р’Вµ Р В Р’В Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В Р В Р’В Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В Р Р‹Р В Р РЏР В Р’В Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р РЏ Р В Р Р‹Р Р†Р вЂљР Р‹Р В Р’В Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’ВµР В Р’В Р вЂ™Р’В· backend Р В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚Сћ SKILLEDGE_ADMIN_EMAILS. Service role key Р В Р’В Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР’ВР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р РЏ Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р РЋРІР‚СћР В Р’В Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В Р’В Р РЋРІР‚СњР В Р’В Р РЋРІР‚Сћ Р В Р’В Р В РІР‚В¦Р В Р’В Р вЂ™Р’В° Р В Р Р‹Р В РЎвЂњР В Р’В Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В Р’В Р В РІР‚В Р В Р’В Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’Вµ."
            href="/admin"
            status="protected"
            disabled
          />
        </section>
      </div>
    </main>
  );
}
