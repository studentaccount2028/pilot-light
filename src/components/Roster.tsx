// AI-assisted: written with Claude Code from the team's build spec.
"use client";
import { useMemo, useState } from "react";
import { fmtAgo, fmtCountdown } from "@/lib/client/format";
import { usePoll } from "@/lib/client/hooks";
import type { Status, Tier } from "@/lib/client/types";
import { HouseholdMap } from "./HouseholdMap";
import { TierChip } from "./RiskCard";
import { TopBar } from "./TopBar";

interface Row {
  id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
  status: Status;
  resolvedReason: string | null;
  lastHeartbeatAt: string | null;
  remainingMs: number | null;
  limitingDevice: string | null;
  limitingHours: number;
  lastCheck: { at: string; message: string } | null;
  tier: Tier;
  reason: string | null;
  noReply: boolean;
}
interface RosterDto {
  town: string;
  now: string;
  multiplier: number;
  rows: Row[];
}

function describe(r: Row): { text: string; tone: string; pin: string; urgent: boolean } {
  if (r.status === "resolved" && r.resolvedReason === "help") return { text: "HELP", tone: "text-danger", pin: "#ff5b4f", urgent: true };
  if (r.remainingMs != null) {
    if (r.remainingMs <= 0) return { text: "0:00:00", tone: "text-danger", pin: "#ff5b4f", urgent: true };
    if (r.remainingMs <= 2 * 3_600_000) return { text: fmtCountdown(r.remainingMs), tone: "text-danger", pin: "#ff5b4f", urgent: true };
    return { text: fmtCountdown(r.remainingMs), tone: "text-ink", pin: "#ffc043", urgent: true };
  }
  if (r.status === "warning_active") return { text: "Checking in", tone: "text-warn", pin: "#ffc043", urgent: false };
  if (r.status === "resolved") return { text: "Back in contact", tone: "text-ok", pin: "#06c167", urgent: false };
  return { text: "Normal", tone: "text-muted", pin: "#ffffff", urgent: false };
}

// What a town coordinator looks at during a storm: opted-in households, the
// most urgent first, with a way to record that someone has checked.
export function Roster({ town }: { town: string }) {
  const headers = useMemo(() => ({}), []);
  const url = `/api/town/${encodeURIComponent(town)}`;
  const { data, error, stale, reload } = usePoll<RosterDto>(url, 3000, headers);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function markChecked(id: string) {
    setBusy(id);
    setActionError(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ householdId: id }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not record the check.");
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not record the check.");
    } finally {
      setBusy(null);
    }
  }

  let body: React.ReactNode;
  if (error && !data) {
    body = <p className="pt-10 text-[17px] font-semibold text-danger">{error}</p>;
  } else if (!data) {
    body = <div className="mt-10 h-96 animate-pulse rounded-2xl bg-surface-2" />;
  } else {
    const nowMs = Date.parse(data.now);
    const urgent = data.rows.filter((r) => describe(r).urgent).length;
    body = (
      <div className="pt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Volunteer roster</p>
            <h1 className="font-display text-[32px] font-semibold leading-none tracking-[-0.03em]">{data.town}</h1>
            <p className="mt-3 text-[15px] text-ink-2">
              {data.rows.length} shared {data.rows.length === 1 ? "household" : "households"} ·{" "}
              <span className={urgent > 0 ? "font-semibold text-danger" : ""}>{urgent} need a check now</span>
            </p>
          </div>
          <button className="btn print:hidden" onClick={() => window.print()}>
            Print
          </button>
        </div>
        {stale && <p className="mt-4 text-[14px] font-semibold text-warn">Connection lost. Showing the last update.</p>}
        {actionError && (
          <p className="mt-4 rounded-xl bg-danger/10 px-4 py-3 font-semibold text-danger" role="alert">
            {actionError}
          </p>
        )}

        {data.rows.length === 0 ? (
          <div className="mt-10 max-w-md">
            <h2 className="h-section">No households on this roster yet</h2>
            <p className="mt-2 text-ink-2">
              A household appears here when its family switches on &quot;Share with the town volunteer roster&quot; and the town on its profile is {data.town}.
            </p>
          </div>
        ) : (
          <div className="mt-8 grid items-start gap-10 lg:grid-cols-2">
            <ul className="divide-y divide-line border-y border-line">
              {data.rows.map((r) => {
                const d = describe(r);
                return (
                  <li key={r.id} className={`py-5 ${r.tier === "check_first" && d.urgent ? "border-l-2 !border-l-danger pl-4" : ""}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-[18px] font-semibold tracking-[-0.02em]">
                          {r.label}
                          <TierChip tier={r.tier} />
                          {r.noReply && <span className="rounded-md border border-warn/30 bg-warn/10 px-2 py-0.5 text-[12px] font-semibold text-warn">No reply</span>}
                        </p>
                        <p className="text-[15px] text-ink-2">{r.address}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={`font-display text-[28px] font-semibold leading-none tracking-tight tabular-nums ${d.tone}`}>{d.text}</p>
                        {r.remainingMs != null && r.remainingMs > 0 && <p className="mt-1 text-[12px] text-muted">of backup left</p>}
                      </div>
                    </div>
                    {r.reason && <p className={`mt-2 text-[14px] font-medium ${r.tier === "check_first" ? "text-danger" : "text-ink-2"}`}>{r.reason}</p>}
                    <p className="mt-2 text-[14px] text-muted">
                      {r.limitingDevice ?? "No device listed"} · {r.limitingHours > 0 ? `${r.limitingHours} h backup` : "no backup"} · last heard from{" "}
                      {r.lastHeartbeatAt ? fmtAgo(nowMs - Date.parse(r.lastHeartbeatAt)) : "never"}
                    </p>
                    <div className="mt-3 flex items-center gap-3 print:hidden">
                      <button className={`btn btn-sm ${d.urgent && !r.lastCheck ? "btn-primary" : ""}`} onClick={() => markChecked(r.id)} disabled={busy !== null}>
                        {busy === r.id ? "Saving…" : "Mark checked"}
                      </button>
                      {r.lastCheck && <p className="text-[14px] font-semibold text-ok">Checked {fmtAgo(nowMs - Date.parse(r.lastCheck.at))}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="h-[460px] overflow-hidden rounded-2xl border border-line print:hidden lg:sticky lg:top-20">
              <HouseholdMap
                center={{ lat: data.rows[0].lat, lng: data.rows[0].lng }}
                town={data.town}
                zoom={9.8}
                points={data.rows.map((r) => ({ lat: r.lat, lng: r.lng, label: r.label, color: describe(r).pin, pulse: describe(r).urgent }))}
              />
            </div>
          </div>
        )}
        <p className="mt-8 text-[13px] text-muted">A check recorded here does not stop the clock. Only the phone at the house checking in, or a HELP reply, does.</p>
      </div>
    );
  }

  return (
    <>
      <TopBar wide />
      <main className="mx-auto max-w-6xl px-5 pb-16">{body}</main>
    </>
  );
}
