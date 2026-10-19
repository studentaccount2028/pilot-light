// AI-assisted: written with Claude Code from the team's build spec.
"use client";
import { tap } from "@/lib/native";
import { useEffect, useRef, useState } from "react";
import { fmtAgo, fmtCountdown, fmtHours } from "@/lib/client/format";
import { useAppClock, usePoll } from "@/lib/client/hooks";
import { fmtTime, minutesAway } from "@/lib/client/responders";
import type { EventDto, NearbySiteDto, Tier } from "@/lib/client/types";
import { HouseholdMap } from "./HouseholdMap";
import { IconAlert, IconCheck, IconHospital, IconPhone, IconPin } from "./icons";
import { PhoneStage } from "./Phone";
import { TierChip } from "./RiskCard";
import { TopBar } from "./TopBar";

type Stage = "alerted" | "seen" | "help" | "on_way" | "arrived";
interface Teammate {
  id: string;
  name: string;
  phone: string;
  volunteer: boolean;
  isMe: boolean;
  stage: Stage;
  etaAt: string | null;
  arrivedAt: string | null;
}
interface Base {
  me: { id: string; name: string; volunteer: boolean };
  household: { label: string; town: string };
  clock: { now: string; multiplier: number; replayActive: boolean };
}
type ViewDto =
  | (Base & { active: false; status: string })
  | (Base & {
      active: true;
      status: string;
      helpRequested: boolean;
      remainingMs: number | null;
      countdownZeroAt: string | null;
      tier: Tier;
      reason: string | null;
      address: string;
      lat: number;
      lng: number;
      accessNotes: string | null;
      resident: { name: string | null; phone: string | null; livesAlone: boolean | null; canLeaveUnassisted: boolean | null };
      devices: { label: string; type: string; backupHours: number | null; limiting: boolean }[];
      team: Teammate[];
      alerted: boolean;
      ems: { status: string; label: string; unit: string | null; note: string | null; at: string } | null;
      events: EventDto[];
      steps: { title: string; detail: string; urgent?: boolean }[];
    });

const STAGE_TEXT: Record<Stage, string> = { alerted: "Alerted, no reply yet", seen: "Saw the alert", help: "Asked for help", on_way: "On the way", arrived: "At the house" };
const STAGE_DOT: Record<Stage, string> = { alerted: "bg-warn", seen: "bg-info", help: "bg-danger", on_way: "bg-ink", arrived: "bg-ok" };
const SITE_WORD: Record<NearbySiteDto["kind"], string> = { hospital: "Hospital", fire: "Fire", police: "Police" };
const ETA_CHOICES = [10, 20, 30, 45, 60];

const mapsLink = (lat: number, lng: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

// The page a neighbor or volunteer opens from the alert text: how much time
// is left, what to do when they get there, and who else is already going.
export function ResponderView({ linkKey }: { linkKey: string }) {
  const url = `/api/r/${linkKey}`;
  const { data, error, stale, reload, fetchedAt } = usePoll<ViewDto>(url, 3000);
  const nowMs = useAppClock(data?.clock ? { ...data.clock, replayHouseholdId: null } : undefined, fetchedAt);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);
  const [eta, setEta] = useState(20);
  const [sites, setSites] = useState<NearbySiteDto[]>([]);
  const askedSites = useRef(false);

  const active = data?.active === true;
  useEffect(() => {
    if (!active || askedSites.current) return;
    askedSites.current = true;
    fetch(`${url}/nearby`)
      .then((r) => (r.ok ? r.json() : { sites: [] }))
      .then((j) => setSites(j.sites ?? []))
      .catch(() => {});
  }, [active, url]);

  async function act(action: "on_way" | "arrived" | "help", minutes?: number) {
    if (action === "help" && !window.confirm("Alert everyone on this household's list that help is needed?")) return;
    tap(action === "help" ? "warning" : "action");
    setBusy(action);
    setToast(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, minutes }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "That didn't go through. Try again, or reply to the text instead.");
      setToast({ text: (json.message ?? "Logged.").replace(/^Pilot Light: /, "") });
      await reload();
    } catch (err) {
      setToast({ text: err instanceof TypeError ? "No connection. Reply to the text message instead (OK 20, HERE or HELP)." : err instanceof Error ? err.message : "Could not save.", bad: true });
    } finally {
      setBusy(null);
    }
  }

  let body: React.ReactNode;
  if (error && !data) {
    body = (
      <div className="space-y-3 pt-8">
        <h1 className="title-xl">Link not found</h1>
        <p className="text-ink-2">{error}</p>
        <a href="tel:911" className="btn btn-danger h-12 w-full">
          Call 911
        </a>
      </div>
    );
  } else if (!data || nowMs == null) {
    body = <div className="mt-8 h-96 animate-pulse rounded-2xl bg-surface-2" />;
  } else if (!data.active) {
    body = (
      <div className="space-y-3 pt-8">
        <p className="eyebrow">Responder · {data.me.name}</p>
        <h1 className="title-xl">Nothing to do right now</h1>
        <p className="text-[15px] leading-snug text-ink-2">
          You&apos;re on the list for {data.household.label} in {data.household.town}. If the power goes out there and they stop checking in, you&apos;ll get a text, and
          this page will show what to do.
        </p>
      </div>
    );
  } else {
    const d = data;
    const remaining = d.countdownZeroAt ? Date.parse(d.countdownZeroAt) - nowMs : null;
    const out = remaining != null && remaining <= 0;
    const me = d.team.find((t) => t.isMe) ?? null;
    const others = d.team.filter((t) => !t.isMe);
    const who = d.resident.name?.trim() || "them";
    const headline = d.helpRequested ? "Help requested" : out ? "Backup has likely run out" : remaining != null ? fmtCountdown(remaining) : "Power appears out";
    const danger = d.helpRequested || out || (remaining != null && remaining <= 2 * 3_600_000);

    body = (
      <div className="space-y-6 pb-8 pt-5">
        <section className={`rounded-2xl border p-4 ${danger ? "border-danger/40 bg-danger/10" : "border-line bg-surface"}`} aria-live="polite">
          <div className="flex items-center justify-between gap-2">
            <p className="eyebrow">{d.household.label} · {d.household.town}</p>
            <TierChip tier={d.tier} />
          </div>
          <p className={`mt-2 font-display text-[40px] font-semibold leading-none tracking-[-0.03em] tabular-nums ${danger ? "text-danger" : ""}`}>{headline}</p>
          {remaining != null && remaining > 0 && !d.helpRequested && <p className="mt-1 text-[14px] text-muted">of backup power left on the {d.devices.find((x) => x.limiting)?.label.toLowerCase() ?? "device"}</p>}
          {d.reason && <p className="mt-3 text-[15px] font-medium text-ink-2">{d.reason}</p>}
          {d.ems && (
            <p className="mt-3 rounded-xl bg-info/15 px-3 py-2 text-[14px] font-semibold text-info">
              EMS: {d.ems.unit ? `${d.ems.unit} · ` : ""}
              {d.ems.label}
              {d.ems.note ? `. ${d.ems.note}` : ""}
            </p>
          )}
          <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
            {d.resident.phone ? (
              <a href={`tel:${d.resident.phone}`} className="btn btn-primary h-12 gap-2">
                <IconPhone className="h-5 w-5" /> Call {who}
              </a>
            ) : (
              <a href={mapsLink(d.lat, d.lng)} className="btn btn-primary h-12 gap-2" target="_blank" rel="noreferrer">
                <IconPin className="h-5 w-5" /> Directions
              </a>
            )}
            <a href="tel:911" className="btn btn-danger h-12 px-5">
              911
            </a>
          </div>
        </section>

        {/* Your part: the same three answers as the text replies. */}
        <section>
          <h2 className="h-section">Your status</h2>
          {me ? (
            <p className="mt-1 text-[15px] text-ink-2">
              {me.stage === "on_way" && me.etaAt
                ? (() => {
                    const left = minutesAway(me.etaAt, nowMs);
                    return left != null ? `On the way, about ${left} min out (arriving ${fmtTime(me.etaAt)}).` : `You were due at ${fmtTime(me.etaAt)}. Tap "I'm here" when you arrive.`;
                  })()
                : me.stage === "arrived"
                  ? `Logged as at the house since ${fmtTime(me.arrivedAt!)}.`
                  : STAGE_TEXT[me.stage] + "."}
            </p>
          ) : (
            <p className="mt-1 text-[15px] text-ink-2">You haven&apos;t been alerted for this one yet. Others on the list are handling it; you&apos;ll get a text if you&apos;re needed.</p>
          )}
          {me && me.stage !== "arrived" && (
            <div className="mt-3 space-y-2">
              {me.stage !== "on_way" && (
                <div className="flex gap-2">
                  <select className="field !w-auto" value={eta} onChange={(e) => setEta(Number(e.target.value))} aria-label="Minutes away">
                    {ETA_CHOICES.map((m) => (
                      <option key={m} value={m}>
                        {m} min away
                      </option>
                    ))}
                  </select>
                  <button className="btn btn-primary h-12 flex-1" onClick={() => act("on_way", eta)} disabled={busy !== null}>
                    {busy === "on_way" ? "Saving…" : "I'm on my way"}
                  </button>
                </div>
              )}
              <button className="btn h-12 w-full gap-2" onClick={() => act("arrived")} disabled={busy !== null}>
                <IconCheck className="h-5 w-5" /> {busy === "arrived" ? "Saving…" : `I'm here with ${who}`}
              </button>
              {!d.helpRequested && (
                <button className="btn h-12 w-full gap-2 !border-danger/40 !text-danger" onClick={() => act("help")} disabled={busy !== null}>
                  <IconAlert className="h-5 w-5" /> {busy === "help" ? "Sending…" : "They need help: alert everyone"}
                </button>
              )}
            </div>
          )}
          {toast && (
            <p className={`mt-3 rounded-xl px-4 py-3 text-[14px] font-semibold ${toast.bad ? "bg-danger/10 text-danger" : "bg-ok/10 text-ok"}`} role="status">
              {toast.text}
            </p>
          )}
        </section>

        <section>
          <h2 className="h-section">What to do</h2>
          <ol className="mt-3 space-y-3">
            {d.steps.map((s, i) => (
              <li key={s.title} className={`flex gap-3 rounded-xl border p-3.5 ${s.urgent ? "border-danger/40 bg-danger/5" : "border-line bg-surface"}`}>
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold ${s.urgent ? "bg-danger text-white" : "bg-surface-3 text-ink"}`}>{i + 1}</span>
                <div className="min-w-0">
                  <p className={`text-[15px] font-semibold ${s.urgent ? "text-danger" : ""}`}>{s.title}</p>
                  <p className="mt-0.5 text-[14px] leading-snug text-ink-2">{s.detail}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[12px] text-muted">General safety guidance, not medical advice. Call 911 for any emergency.</p>
        </section>

        <section>
          <h2 className="h-section">Who else is responding</h2>
          {others.length === 0 ? (
            <p className="mt-1 text-[15px] text-ink-2">No one else has been alerted yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-surface">
              {others.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-3.5 py-3">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${STAGE_DOT[t.stage]}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold">{t.name}</p>
                    <p className="text-[13px] text-muted">
                      {t.stage === "on_way" && t.etaAt ? `On the way · arrives ${fmtTime(t.etaAt)}` : t.stage === "arrived" && t.arrivedAt ? `At the house since ${fmtTime(t.arrivedAt)}` : STAGE_TEXT[t.stage]}
                    </p>
                  </div>
                  <a href={`tel:${t.phone}`} className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface-2" aria-label={`Call ${t.name}`}>
                    <IconPhone className="h-4 w-4" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="h-section">The house</h2>
          <p className="mt-1 text-[15px] font-medium">{d.address}</p>
          <a href={mapsLink(d.lat, d.lng)} target="_blank" rel="noreferrer" className="link mt-1 inline-block text-[14px]">
            Open directions
          </a>
          <div className="mt-3 h-56 overflow-hidden rounded-xl border border-line">
            <HouseholdMap center={{ lat: d.lat, lng: d.lng }} town={d.household.town} zoom={11} legend={false} points={[{ lat: d.lat, lng: d.lng, label: d.household.label, color: danger ? "#ff5b4f" : "#ffc043", pulse: true }]} sites={sites} />
          </div>
          <dl className="mt-3 space-y-2 text-[14px]">
            <div>
              <dt className="text-muted">Getting in</dt>
              <dd className="text-ink-2">{d.accessNotes || "No entry notes."}</dd>
            </div>
            <div>
              <dt className="text-muted">Devices</dt>
              <dd className="text-ink-2">{d.devices.map((x) => `${x.label} (${fmtHours(x.backupHours)})`).join(" · ")}</dd>
            </div>
            <div>
              <dt className="text-muted">Getting around</dt>
              <dd className="text-ink-2">
                {d.resident.canLeaveUnassisted === false ? "Can't leave the house without help." : d.resident.canLeaveUnassisted ? "Can leave the house on their own." : "Not known."}
                {d.resident.livesAlone ? " Lives alone." : ""}
              </dd>
            </div>
          </dl>
          {sites.length > 0 && (
            <ul className="mt-3 space-y-1.5 text-[14px]">
              {sites.map((s) => (
                <li key={s.kind} className="flex items-center gap-2 text-ink-2">
                  <IconHospital className="h-4 w-4 shrink-0 text-muted" />
                  <span className="w-16 shrink-0 text-muted">{SITE_WORD[s.kind]}</span>
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  <span className="shrink-0 tabular-nums text-muted">{s.minutes} min</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {d.events.length > 0 && (
          <section>
            <h2 className="h-section">Latest</h2>
            <ul className="mt-2 space-y-2">
              {d.events.slice(0, 6).map((e) => (
                <li key={e.id} className="text-[13px] leading-snug text-ink-2">
                  <span className="text-muted">{fmtAgo(nowMs - Date.parse(e.at))} · </span>
                  {e.message}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  }

  return (
    <PhoneStage>
      <TopBar />
      <main className="mx-auto max-w-[440px] px-5">
        {data?.clock.replayActive && <p className="mt-3 rounded-lg bg-surface-2 px-3 py-1.5 text-center text-[12px] font-semibold text-muted">Storm replay · simulated</p>}
        {stale && <p className="mt-3 text-[14px] font-semibold text-warn">Connection lost. Showing the last update.</p>}
        {body}
      </main>
    </PhoneStage>
  );
}
