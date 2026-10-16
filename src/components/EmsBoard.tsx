// AI-assisted: written with Claude Code from the team's build spec.
"use client";
import { useEffect, useMemo, useState } from "react";
import { fmtAgo, fmtCountdown, fmtHours } from "@/lib/client/format";
import { useAppClock, usePoll } from "@/lib/client/hooks";
import { fmtTime, minutesAway } from "@/lib/client/responders";
import type { NearbySiteDto, Tier } from "@/lib/client/types";
import { HouseholdMap } from "./HouseholdMap";
import { IconPhone } from "./icons";
import { TierChip } from "./RiskCard";
import { TopBar } from "./TopBar";

type EmsStatus = "assigned" | "en_route" | "on_scene" | "sheltered" | "transported" | "cleared";
type Stage = "alerted" | "seen" | "help" | "on_way" | "arrived";
interface EmsRow {
  id: number;
  status: EmsStatus;
  label: string;
  unit: string | null;
  note: string | null;
  at: string;
}
interface Incident {
  id: string;
  label: string;
  address: string;
  town: string;
  lat: number;
  lng: number;
  helpRequested: boolean;
  outageInferredAt: string;
  remainingMs: number | null;
  tier: Tier;
  reason: string | null;
  resident: { name: string | null; phone: string | null; age: number | null; livesAlone: boolean | null; canLeaveUnassisted: boolean | null };
  accessNotes: string | null;
  devices: { type: string; label: string; backupHours: number | null; limiting: boolean }[];
  responders: { id: string; name: string; phone: string; volunteer: boolean; stage: Stage; etaAt: string | null; arrivedAt: string | null }[];
  ems: EmsRow | null;
  emsHistory: EmsRow[];
}
interface BoardDto {
  now: string;
  multiplier: number;
  replayActive: boolean;
  shared: number;
  incidents: Incident[];
  watching: { id: string; label: string; town: string; devices: string[] }[];
  byDevice: Record<string, number>;
}

const STATUSES: { key: EmsStatus; text: string }[] = [
  { key: "assigned", text: "Assign unit" },
  { key: "en_route", text: "En route" },
  { key: "on_scene", text: "On scene" },
  { key: "sheltered", text: "Moved to shelter" },
  { key: "transported", text: "Transported" },
  { key: "cleared", text: "Cleared" },
];
const DEVICE_NAME: Record<string, string> = {
  o2_concentrator: "Oxygen",
  cpap: "CPAP",
  power_chair: "Power chair",
  home_dialysis: "Home dialysis",
  fridge_meds: "Cold medicine",
  electric_heat: "Electric heat",
};
const STAGE_TEXT: Record<Stage, string> = { alerted: "No reply", seen: "Saw alert", help: "Reported HELP", on_way: "On the way", arrived: "At the house" };
const STAGE_DOT: Record<Stage, string> = { alerted: "bg-warn", seen: "bg-info", help: "bg-danger", on_way: "bg-ink", arrived: "bg-ok" };
const DONE: EmsStatus[] = ["sheltered", "transported", "cleared"];

// Live time left, from the server's figure advanced by the local clock.
function left(i: Incident, nowMs: number, serverNowMs: number): number | null {
  return i.remainingMs == null ? null : i.remainingMs - (nowMs - serverNowMs);
}

function urgencyOf(i: Incident, ms: number | null): { text: string; tone: string; pin: string } {
  if (i.ems && DONE.includes(i.ems.status)) return { text: i.ems.label, tone: "text-ok", pin: "#4cb782" };
  if (i.helpRequested) return { text: "HELP", tone: "text-danger", pin: "#eb5757" };
  if (ms != null && ms <= 0) return { text: "Backup out", tone: "text-danger", pin: "#eb5757" };
  if (ms != null) return { text: fmtCountdown(ms), tone: ms <= 2 * 3_600_000 ? "text-danger" : "text-ink", pin: ms <= 2 * 3_600_000 ? "#eb5757" : "#f2c94c" };
  return { text: "Outage", tone: "text-warn", pin: "#f2c94c" };
}

// What a dispatcher or crew lead looks at: every shared household in an
// outage, worst first, with what they need to know before they roll.
export function EmsBoard({ adminKey }: { adminKey: string }) {
  const headers = useMemo(() => ({ "x-admin-token": adminKey }), [adminKey]);
  const { data, error, stale, reload, fetchedAt } = usePoll<BoardDto>("/api/ems", 3000, headers);
  const nowMs = useAppClock(data ? { now: data.now, multiplier: data.multiplier, replayActive: data.replayActive, replayHouseholdId: null } : undefined, fetchedAt);
  const [selected, setSelected] = useState<string | null>(null);
  const [unit, setUnit] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<EmsStatus | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sites, setSites] = useState<Record<string, NearbySiteDto[]>>({});

  const current = data?.incidents.find((i) => i.id === selected) ?? data?.incidents[0] ?? null;
  const currentId = current?.id ?? null;

  // Prefill the unit from the last update, so "En route" after "Assign" keeps it.
  useEffect(() => {
    setUnit(current?.ems?.unit ?? "");
    setNote("");
    setActionError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  useEffect(() => {
    if (!currentId || sites[currentId]) return;
    fetch(`/api/ems/${currentId}`, { headers })
      .then((r) => (r.ok ? r.json() : { sites: [] }))
      .then((j) => setSites((s) => ({ ...s, [currentId]: j.sites ?? [] })))
      .catch(() => {});
  }, [currentId, headers, sites]);

  async function update(status: EmsStatus) {
    if (!current) return;
    setBusy(status);
    setActionError(null);
    try {
      const res = await fetch(`/api/ems/${current.id}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ status, unit, note }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not save the update.");
      setNote("");
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not save the update.");
    } finally {
      setBusy(null);
    }
  }

  let body: React.ReactNode;
  if (error && !data) {
    body = <p className="pt-10 text-[17px] font-semibold text-danger">{error}</p>;
  } else if (!data || nowMs == null) {
    body = <div className="mt-10 h-96 animate-pulse rounded-2xl bg-surface-2" />;
  } else {
    const serverNow = Date.parse(data.now);
    const open = data.incidents.filter((i) => !(i.ems && DONE.includes(i.ems.status)));
    const critical = open.filter((i) => {
      const ms = left(i, nowMs, serverNow);
      return i.helpRequested || (ms != null && ms <= 2 * 3_600_000);
    }).length;
    const deviceSummary = Object.entries(data.byDevice)
      .sort((a, b) => b[1] - a[1])
      .map(([t, n]) => `${n} ${DEVICE_NAME[t] ?? t}`)
      .join(" · ");

    body = (
      <div className="pt-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">EMS coordination</p>
            <h1 className="font-display text-[32px] font-semibold leading-none tracking-[-0.03em]">Power-dependent residents</h1>
            <p className="mt-3 text-[15px] text-ink-2">
              {data.shared} households shared with EMS · <span className={critical > 0 ? "font-semibold text-danger" : ""}>{critical} critical</span> · {open.length} open
            </p>
          </div>
          {data.replayActive && <span className="rounded-lg bg-surface-2 px-3 py-1.5 text-[13px] font-semibold text-muted">Storm replay · {data.multiplier}x · simulated</span>}
        </div>

        {/* Ahead of the outage: who is under a warning, by device, for staging. */}
        <section className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-line bg-surface p-4">
            <p className="text-[13px] text-muted">Open incidents</p>
            <p className="mt-1 font-display text-[30px] font-semibold leading-none tabular-nums">{open.length}</p>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-4">
            <p className="text-[13px] text-muted">Under a storm warning, power still on</p>
            <p className="mt-1 font-display text-[30px] font-semibold leading-none tabular-nums">{data.watching.length}</p>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-4">
            <p className="text-[13px] text-muted">Devices in warned areas</p>
            <p className="mt-1.5 text-[15px] font-semibold text-ink-2">{deviceSummary || "None"}</p>
          </div>
        </section>
        {stale && <p className="mt-4 text-[14px] font-semibold text-warn">Connection lost. Showing the last update.</p>}

        {data.incidents.length === 0 ? (
          <div className="mt-10 max-w-lg">
            <h2 className="h-section">No open incidents</h2>
            <p className="mt-2 text-ink-2">
              A household appears here when its power appears to be out (a storm warning and a silent phone at the house) or someone asks for help. Only households whose family
              chose to share with the town are listed.
            </p>
          </div>
        ) : (
          <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {data.incidents.map((i) => {
                const ms = left(i, nowMs, serverNow);
                const u = urgencyOf(i, ms);
                const lead = i.responders.find((r) => r.stage === "arrived") ?? i.responders.find((r) => r.stage === "on_way");
                const isSel = i.id === current?.id;
                return (
                  <li key={i.id}>
                    <button className={`block w-full cursor-pointer px-4 py-4 text-left ${isSel ? "bg-surface-2" : "hover:bg-surface-2/60"}`} onClick={() => setSelected(i.id)} aria-pressed={isSel}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2 text-[16px] font-semibold">
                            {i.label}
                            <TierChip tier={i.tier} />
                          </p>
                          <p className="truncate text-[14px] text-ink-2">
                            {i.address}, {i.town}
                          </p>
                        </div>
                        <p className={`shrink-0 font-display text-[22px] font-semibold leading-none tabular-nums ${u.tone}`}>{u.text}</p>
                      </div>
                      <p className="mt-2 text-[13px] text-muted">
                        {[...new Set(i.devices.map((d) => DEVICE_NAME[d.type] ?? d.label))].join(", ")}
                        {i.resident.canLeaveUnassisted === false && <span className="font-semibold text-warn"> · needs help to leave</span>}
                        {lead ? ` · ${lead.name}: ${STAGE_TEXT[lead.stage].toLowerCase()}` : " · no neighbor on the way"}
                        {i.ems && ` · EMS ${i.ems.label.toLowerCase()}`}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>

            {current && (
              <section className="space-y-6 lg:sticky lg:top-20">
                <div className="h-64 overflow-hidden rounded-2xl border border-line">
                  <HouseholdMap
                    key={current.id}
                    center={{ lat: current.lat, lng: current.lng }}
                    town={current.town}
                    zoom={10.5}
                    legend={false}
                    sites={sites[current.id] ?? []}
                    points={data.incidents.map((i) => ({ lat: i.lat, lng: i.lng, label: i.label, color: urgencyOf(i, left(i, nowMs, serverNow)).pin, pulse: i.id === current.id }))}
                  />
                </div>

                <div>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-[22px] font-semibold tracking-[-0.02em]">{current.label}</h2>
                      <p className="text-[15px] text-ink-2">
                        {current.address}, {current.town}
                      </p>
                    </div>
                    <a href={`https://www.google.com/maps/dir/?api=1&destination=${current.lat},${current.lng}`} target="_blank" rel="noreferrer" className="btn btn-sm">
                      Directions
                    </a>
                  </div>
                  {current.reason && <p className="mt-2 text-[15px] font-medium text-danger">{current.reason}</p>}
                </div>

                <dl className="grid gap-x-6 gap-y-4 rounded-2xl border border-line bg-surface p-4 text-[14px] sm:grid-cols-2">
                  <div>
                    <dt className="text-muted">Resident</dt>
                    <dd className="font-medium">
                      {current.resident.name ?? "Not named"}
                      {current.resident.age ? `, ${current.resident.age}` : ""}
                      {current.resident.livesAlone ? " · lives alone" : ""}
                    </dd>
                    {current.resident.phone && (
                      <a href={`tel:${current.resident.phone}`} className="link text-[14px]">
                        {current.resident.phone}
                      </a>
                    )}
                  </div>
                  <div>
                    <dt className="text-muted">Mobility</dt>
                    <dd className={`font-medium ${current.resident.canLeaveUnassisted === false ? "text-warn" : ""}`}>
                      {current.resident.canLeaveUnassisted === false ? "Cannot leave without help: plan a lift assist" : current.resident.canLeaveUnassisted ? "Can leave on their own" : "Not known"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Devices</dt>
                    <dd className="space-y-0.5">
                      {current.devices.map((d) => (
                        <p key={d.label} className={d.limiting ? "font-semibold" : ""}>
                          {d.label} · {fmtHours(d.backupHours)}
                          {d.limiting ? " (shortest)" : ""}
                        </p>
                      ))}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Getting in</dt>
                    <dd>{current.accessNotes || "No entry notes."}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Power out since</dt>
                    <dd>
                      {fmtTime(current.outageInferredAt)} ({fmtAgo(nowMs - Date.parse(current.outageInferredAt))})
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Nearest</dt>
                    <dd className="space-y-0.5">
                      {(sites[current.id] ?? []).length === 0 ? (
                        <p className="text-muted">Looking up…</p>
                      ) : (
                        sites[current.id].map((s) => (
                          <p key={s.kind}>
                            {s.name} · {s.minutes} min{s.estimated ? " (est.)" : ""}
                          </p>
                        ))
                      )}
                    </dd>
                  </div>
                </dl>

                <div>
                  <h3 className="h-section">Neighbors and volunteers</h3>
                  {current.responders.length === 0 ? (
                    <p className="mt-1 text-[14px] text-ink-2">No one has been alerted yet.</p>
                  ) : (
                    <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-surface">
                      {current.responders.map((r) => {
                        const m = r.etaAt ? minutesAway(r.etaAt, nowMs) : null;
                        return (
                          <li key={r.id} className="flex items-center gap-3 px-3.5 py-2.5">
                            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${STAGE_DOT[r.stage]}`} />
                            <p className="min-w-0 flex-1 text-[14px]">
                              <span className="font-semibold">{r.name}</span>
                              <span className="text-muted">
                                {" "}
                                · {r.stage === "on_way" && r.etaAt ? (m != null ? `${m} min out` : `due ${fmtTime(r.etaAt)}`) : r.stage === "arrived" && r.arrivedAt ? `at the house since ${fmtTime(r.arrivedAt)}` : STAGE_TEXT[r.stage].toLowerCase()}
                              </span>
                            </p>
                            <a href={`tel:${r.phone}`} className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface-2" aria-label={`Call ${r.name}`}>
                              <IconPhone className="h-4 w-4" />
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div>
                  <h3 className="h-section">EMS status</h3>
                  <p className="mt-1 text-[14px] text-ink-2">Families and neighbors see each update on their screens.</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <input className="field" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Unit, e.g. Ossipee Rescue 2" maxLength={60} />
                    <input className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional), e.g. taken to Huggins Hospital" maxLength={300} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {STATUSES.map((s) => (
                      <button key={s.key} className={`btn btn-sm ${current.ems?.status === s.key ? "btn-primary" : ""}`} onClick={() => update(s.key)} disabled={busy !== null}>
                        {busy === s.key ? "Saving…" : s.text}
                      </button>
                    ))}
                  </div>
                  {actionError && (
                    <p className="mt-3 rounded-xl bg-danger/10 px-4 py-3 text-[14px] font-semibold text-danger" role="alert">
                      {actionError}
                    </p>
                  )}
                  {current.emsHistory.length > 0 && (
                    <ul className="mt-4 space-y-1.5 border-l border-line pl-4 text-[14px]">
                      {current.emsHistory.map((e) => (
                        <li key={e.id}>
                          <span className="text-muted">{fmtTime(e.at)} · </span>
                          <span className="font-medium">{e.label}</span>
                          {e.unit ? ` · ${e.unit}` : ""}
                          {e.note ? <span className="text-ink-2"> · {e.note}</span> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            )}
          </div>
        )}
        <p className="mt-10 text-[13px] text-muted">
          Pilot Light infers outages from a storm warning plus a silent phone at the house. It is a planning aid for crews, not a 911 call: emergencies still come through
          dispatch.
        </p>
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
