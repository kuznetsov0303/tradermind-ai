"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { authFetch } from "@/lib/security/client-auth-fetch";

type Card = {
  signalId?: string;
  symbol?: string;
  setupSlug?: string;
  direction?: string;
  lifecycleStatus?: string;
  qualityStatus?: string;
  grade?: string;
  score?: number | string | null;
  riskReward?: number | string | null;
  premiumSignal?: boolean;
  telegramEligible?: boolean;
  clientVisible?: boolean;
  clientVisibleApproved?: boolean;
  blockedReasons?: string[];
  headline?: string;
  displayState?: string;
  levels?: {
    entry?: number | string | null;
    stop?: number | string | null;
    targets?: Array<{ price?: number | string | null; r?: number | string | null }>;
  };
  timing?: {
    sessionDate?: string;
    triggerTime?: string;
    storedAt?: string;
  };
};

type Approval = {
  signalId?: string;
  symbol?: string;
  setupSlug?: string;
  status?: string;
  clientVisibleApproved?: boolean;
  reviewedBy?: string;
  reason?: string | null;
  updatedAt?: string;
};

type QueuePayload = {
  ok?: boolean;
  error?: string;
  summary?: {
    rowsEvaluated?: number;
    unifiedCardCount?: number;
    clientVisibleCount?: number;
    researchOnlyCount?: number;
    displayState?: string;
    topBlockedReason?: string | null;
  };
  internalOutput?: {
    recentUnifiedCards?: Card[];
    blockedReasonCounts?: Record<string, number>;
  } | null;
  approvals?: {
    items?: Approval[];
    summary?: {
      count?: number;
      approvedCount?: number;
      clientVisibleApprovedCount?: number;
    };
  };
};

function text(value: unknown, fallback = "РІР‚вЂќ") {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? String(Math.round(value * 1000) / 1000) : fallback;
  return String(value);
}

function shortId(value: unknown) {
  const raw = String(value || "");
  if (!raw) return "missing-signal-id";
  return raw.length > 48 ? `${raw.slice(0, 24)}...${raw.slice(-18)}` : raw;
}

function dateText(value: unknown) {
  const raw = String(value || "");
  if (!raw) return "РІР‚вЂќ";
  try {
    return new Date(raw).toLocaleString("en-GB", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return raw;
  }
}

function reasons(card: Card) {
  return Array.isArray(card.blockedReasons) ? card.blockedReasons.map(String).filter(Boolean) : [];
}

function nonManualBlockers(card: Card) {
  return reasons(card).filter((reason) => reason !== "manual_client_approval_missing");
}

function readyForManualApproval(card: Card) {
  const allReasons = reasons(card);
  return (
    allReasons.includes("manual_client_approval_missing") &&
    nonManualBlockers(card).length === 0 &&
    card.clientVisible !== true &&
    card.clientVisibleApproved !== true
  );
}

function Pill({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "green" | "red" | "amber" | "blue" }) {
  const cls =
    tone === "green"
      ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
      : tone === "red"
        ? "border-rose-300/20 bg-rose-400/10 text-rose-100"
        : tone === "amber"
          ? "border-amber-300/20 bg-amber-300/10 text-amber-100"
          : tone === "blue"
            ? "border-cyan-300/20 bg-cyan-400/10 text-cyan-100"
            : "border-white/10 bg-white/[0.04] text-white/55";

  return <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.13em] ${cls}`}>{children}</span>;
}

function Stat({ label, value, text }: { label: string; value: string; text: string }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-100/40">{label}</p>
      <div className="mt-3 text-3xl font-black tracking-[-0.05em] text-white">{value}</div>
      <p className="mt-2 text-[13px] font-semibold leading-5 text-white/50">{text}</p>
    </div>
  );
}

function SignalCard({ card, ready, loading, onApprove, onReject }: { card: Card; ready: boolean; loading: string; onApprove: (card: Card) => void; onReject: (card: Card) => void }) {
  const signalId = String(card.signalId || "");
  const cardReasons = reasons(card);
  const targets = Array.isArray(card.levels?.targets) ? card.levels?.targets || [] : [];

  return (
    <article className={`rounded-[28px] border p-5 ${ready ? "border-emerald-300/22 bg-emerald-400/[0.055]" : "border-white/10 bg-[#08111F]"}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-2xl font-black tracking-[-0.05em] text-white">{text(card.symbol)}</span>
            <Pill tone={String(card.lifecycleStatus || "").toUpperCase() === "ACTIVE" ? "blue" : "default"}>{text(card.lifecycleStatus)}</Pill>
            <Pill tone={["A", "A+"].includes(String(card.grade || "").toUpperCase()) ? "green" : "default"}>{text(card.grade)}</Pill>
          </div>
          <p className="mt-2 text-sm font-bold text-white/65">{text(card.setupSlug)} Р’В· {text(card.direction).toUpperCase()}</p>
          <p className="mt-2 max-w-3xl text-[13px] font-semibold leading-5 text-white/45">{text(card.headline)}</p>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-white/35">Signal ID</div>
          <div className="mt-1 max-w-[320px] font-mono text-[12px] font-bold text-white/55">{shortId(signalId)}</div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-5">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-3"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/30">Score</p><p className="mt-1 text-lg font-black text-white">{text(card.score)}</p></div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-3"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/30">RR</p><p className="mt-1 text-lg font-black text-white">{text(card.riskReward)}R</p></div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-3"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/30">Entry</p><p className="mt-1 text-lg font-black text-white">{text(card.levels?.entry)}</p></div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-3"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/30">Stop</p><p className="mt-1 text-lg font-black text-white">{text(card.levels?.stop)}</p></div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-3"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/30">TP1</p><p className="mt-1 text-lg font-black text-white">{text(targets[0]?.price)} / {text(targets[0]?.r)}R</p></div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {cardReasons.length ? cardReasons.slice(0, 8).map((reason) => <Pill key={reason} tone={reason === "manual_client_approval_missing" ? "amber" : "default"}>{reason}</Pill>) : <Pill tone="green">no blockers</Pill>}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
        <div className="text-[12px] font-semibold leading-5 text-white/45">Trigger: {dateText(card.timing?.triggerTime)} Р’В· Stored: {dateText(card.timing?.storedAt)}</div>
        <div className="flex flex-wrap gap-2">
          {ready ? (
            <button type="button" disabled={Boolean(loading)} onClick={() => onApprove(card)} className="rounded-full bg-emerald-300 px-5 py-3 text-[12px] font-black uppercase tracking-[0.14em] text-[#06111d] transition hover:-translate-y-0.5 disabled:opacity-50">{loading === signalId ? "Approving..." : "Approve client-visible"}</button>
          ) : (
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-3 text-[12px] font-black uppercase tracking-[0.14em] text-white/35">research only</span>
          )}
          <button type="button" disabled={Boolean(loading)} onClick={() => onReject(card)} className="rounded-full border border-rose-300/20 bg-rose-400/10 px-5 py-3 text-[12px] font-black uppercase tracking-[0.14em] text-rose-100 transition hover:bg-rose-400/15 disabled:opacity-50">{loading === `${signalId}:reject` ? "Rejecting..." : "Reject / block"}</button>
        </div>
      </div>
    </article>
  );
}

export default function AdminSignalsReviewPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [payload, setPayload] = useState<QueuePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [error, setError] = useState("");

  const cards = useMemo(() => Array.isArray(payload?.internalOutput?.recentUnifiedCards) ? payload?.internalOutput?.recentUnifiedCards || [] : [], [payload]);
  const readyCards = useMemo(() => cards.filter(readyForManualApproval), [cards]);
  const blockedCards = useMemo(() => cards.filter((card) => !readyForManualApproval(card)), [cards]);
  const approvals = useMemo(() => Array.isArray(payload?.approvals?.items) ? payload?.approvals?.items || [] : [], [payload]);

  async function checkAdmin() {
    const response = await authFetch("/api/admin/me", { method: "GET" });
    const result = await response.json().catch(() => ({}));
    return Boolean(result.isAdmin);
  }

  async function loadQueue({ soft = false }: { soft?: boolean } = {}) {
    if (soft) setRefreshing(true); else setLoading(true);
    setError("");

    try {
      const admin = await checkAdmin();
      setIsAdmin(admin);
      if (!admin) return;

      const response = await authFetch("/api/admin/signals/review-queue?limit=50&refresh=1", { method: "GET" });
      const result = (await response.json().catch(() => ({}))) as QueuePayload;
      if (!response.ok || result.ok === false) throw new Error(result.error || "Failed to load signal review queue");
      setPayload(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load signal review queue");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function submit(card: Card, action: "approve" | "reject") {
    const signalId = String(card.signalId || "").trim();
    if (!signalId) return setError("Missing signalId. Cannot approve/reject this card.");
    if (action === "approve" && !readyForManualApproval(card)) return setError("This signal is not ready for approval. Other blockers are still active.");

    setActionLoading(action === "approve" ? signalId : `${signalId}:reject`);
    setError("");

    try {
      const response = await authFetch("/api/admin/signals/manual-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          signalId,
          symbol: card.symbol || null,
          setupSlug: card.setupSlug || null,
          sessionDate: card.timing?.sessionDate || null,
          reason: action === "approve" ? "S8.68 admin review queue approval" : "S8.68 admin review queue reject/block",
          notes: action === "approve" ? "Approved only because all non-manual gates were already clear." : `Rejected from review queue. Blockers: ${reasons(card).join(", ")}`,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.ok === false) throw new Error(result?.error || `Failed to ${action} signal`);
      await loadQueue({ soft: true });
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : `Failed to ${action} signal`);
    } finally {
      setActionLoading("");
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadQueue();
    }, 0);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading || isAdmin === null) {
    return <main className="flex min-h-screen items-center justify-center bg-[#050B14] px-4 text-white"><div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 text-center"><p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-100/45">SkillEdge Admin</p><h1 className="mt-3 text-3xl font-black">Loading signal review queue...</h1></div></main>;
  }

  if (!isAdmin) {
    return <main className="flex min-h-screen items-center justify-center bg-[#050B14] px-4 text-white"><div className="max-w-xl rounded-[2rem] border border-rose-300/16 bg-rose-300/[0.05] p-8 text-center"><p className="text-xs font-black uppercase tracking-[0.24em] text-rose-100/55">Access denied</p><h1 className="mt-3 text-4xl font-black tracking-[-0.05em]">Admin access only</h1><p className="mt-4 text-sm font-semibold leading-6 text-white/52">This area is available only for emails listed in SKILLEDGE_ADMIN_EMAILS.</p><Link href="/admin" className="mt-6 inline-flex rounded-full bg-white px-6 py-3 text-sm font-black text-[#06111d] transition hover:-translate-y-0.5">Back to Admin Hub</Link></div></main>;
  }

  return (
    <main className="min-h-screen bg-[#050B14] px-4 py-8 text-white md:px-8">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/admin" className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[13px] font-bold text-slate-300 transition hover:bg-white/[0.08]">{"<- Back to Admin Hub"}</Link>
            <h1 className="mt-5 text-[34px] font-black tracking-tight text-white md:text-[48px]">Signal Review Queue</h1>
            <p className="mt-3 max-w-3xl text-sm font-semibold leading-7 text-slate-400">Internal queue for final manual approval only. It does not bypass quality, RR, grade, lifecycle, premium or Telegram gates.</p>
          </div>
          <button type="button" onClick={() => loadQueue({ soft: true })} disabled={refreshing || Boolean(actionLoading)} className="rounded-full border border-cyan-200/18 bg-cyan-200/[0.07] px-5 py-3 text-sm font-black text-cyan-50 transition hover:bg-cyan-200/[0.12] disabled:opacity-50">{refreshing ? "Refreshing..." : "Refresh queue"}</button>
        </div>

        {error ? <div className="rounded-[24px] border border-rose-300/18 bg-rose-400/10 p-5 text-sm font-bold text-rose-100">{error}</div> : null}

        <section className="grid gap-4 md:grid-cols-4">
          <Stat label="Ready" value={String(readyCards.length)} text="Only manual approval is missing." />
          <Stat label="Research blocked" value={String(blockedCards.length)} text="Other blockers still active." />
          <Stat label="Client visible now" value={String(payload?.summary?.clientVisibleCount ?? 0)} text="Final safe client output count." />
          <Stat label="Approval records" value={String(approvals.length)} text="Latest approve/reject history." />
        </section>

        <section className="rounded-[32px] border border-emerald-300/14 bg-emerald-400/[0.035] p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-100/55">Ready for Manual Approval</p><h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">{readyCards.length ? `${readyCards.length} signal(s) require review` : "No ready signals right now"}</h2></div><Pill tone="green">final gate only</Pill></div>
          {readyCards.length ? <div className="space-y-4">{readyCards.map((card) => <SignalCard key={String(card.signalId || `${card.symbol}-${card.setupSlug}`)} card={card} ready loading={actionLoading} onApprove={(item) => submit(item, "approve")} onReject={(item) => submit(item, "reject")} />)}</div> : <div className="rounded-[24px] border border-white/10 bg-black/20 p-6 text-sm font-semibold leading-6 text-white/52">Nothing to approve. This is normal: the engine should ask for review only when all other gates are already clear.</div>}
        </section>

        <section className="rounded-[32px] border border-white/10 bg-[#07111F] p-5">
          <div className="mb-4"><p className="text-xs font-black uppercase tracking-[0.24em] text-white/35">Research / Blocked</p><h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">Signals blocked by other gates</h2><p className="mt-2 text-sm font-semibold leading-6 text-white/45">Approve is disabled while non-manual blockers remain active.</p></div>
          <div className="space-y-4">{blockedCards.slice(0, 24).map((card) => <SignalCard key={String(card.signalId || `${card.symbol}-${card.setupSlug}`)} card={card} ready={false} loading={actionLoading} onApprove={(item) => submit(item, "approve")} onReject={(item) => submit(item, "reject")} />)}</div>
        </section>

        <section className="rounded-[32px] border border-white/10 bg-white/[0.035] p-5">
          <div className="mb-4"><p className="text-xs font-black uppercase tracking-[0.24em] text-white/35">Approval History</p><h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">Latest manual decisions</h2></div>
          {approvals.length ? <div className="space-y-2">{approvals.slice(0, 20).map((item) => <div key={`${item.signalId}-${item.updatedAt}`} className="grid gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-[13px] font-semibold text-white/60 md:grid-cols-6"><span className="font-black text-white">{text(item.symbol)}</span><span>{text(item.setupSlug)}</span><span className={item.status === "APPROVED" ? "text-emerald-100" : "text-rose-100"}>{text(item.status)}</span><span>{item.clientVisibleApproved ? "client-visible" : "not visible"}</span><span>{text(item.reviewedBy)}</span><span>{dateText(item.updatedAt)}</span></div>)}</div> : <div className="rounded-[24px] border border-white/10 bg-black/20 p-6 text-sm font-semibold leading-6 text-white/45">No approval history yet.</div>}
        </section>
      </div>
    </main>
  );
}
