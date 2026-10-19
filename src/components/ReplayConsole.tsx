// AI-assisted: written with Claude Code from the team's build spec.
"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAppClock, usePoll } from "@/lib/client/hooks";
import { responderFor } from "@/lib/client/responders";
import type { StatusDto } from "@/lib/client/types";
import { EventLog } from "./EventLog";
import { HouseholdView } from "./HouseholdView";
import { Phone } from "./Phone";
import { IconPlay, IconReset } from "./icons";
import { TopBar } from "./TopBar";

interface ReplayDto {
  scenarios: { id: string; name: string }[];
  households: { id: string; label: string; town: string }[];
  speeds: number[];
  replayActive: boolean;
  multiplier: number;
  scenarioId: string | null;
  transport: "twilio" | "simulated";
  inboundReady: boolean;
  status: StatusDto | null;
}

// The demo switch and the test harness in one. Replay fakes the storm, not
// the system: these buttons only change inputs.
export function ReplayConsole() {
  const headers = useMemo(() => ({}), []);
  const [householdId, setHouseholdId] = useState("");
  const [scenarioId, setScenarioId] = useState("");
  const [speed, setSpeed] = useState(120);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [promptReplied, setPromptReplied] = useState(true);

  const { data, setData, error, stale, fetchedAt } = usePoll<ReplayDto>(`/api/replay${householdId ? `?household=${householdId}` : ""}`, 1000, headers);
  const nowMs = useAppClock(data?.status?.clock, fetchedAt);

  useEffect(() => {
    if (!data) return;
    if (!householdId && data.households[0]) setHouseholdId(data.status?.household.id ?? data.households[0].id);
    if (!scenarioId && data.scenarios[0]) setScenarioId(data.scenarioId ?? data.scenarios[0].id);
  }, [data, householdId, scenarioId]);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    setActionError(null);
    try {
      const res = await fetch("/api/replay", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ action, householdId, scenarioId, multiplier: speed, promptReplied, ...extra }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "That did not work.");
      fetchedAt.current = performance.now();
      setData(json as ReplayDto);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "That did not work.");
    } finally {
      setBusy(null);
    }
  }

  let body: React.ReactNode;
  if (error && !data) {
    body = <p className="pt-10 text-[17px] font-semibold text-danger">{error}</p>;
  } else if (!data) {
    body = <div className="mt-10 h-96 animate-pulse rounded-2xl bg-surface-2" />;
  } else if (data.households.length === 0 || data.scenarios.length === 0) {
    body = (
      <div className="max-w-md pt-10">
        <h1 className="font-display text-[34px] font-semibold tracking-tight">Nothing to replay yet</h1>
        <p className="mt-3 text-ink-2">
          Run <code className="rounded bg-surface-2 px-1.5 py-0.5">npm run db:seed</code> to add the Ossipee household and the storm scenario, or{" "}
          <Link className="link" href="/h/new">
            set up a household
          </Link>
          .
        </p>
      </div>
    );
  } else {
    const status = data.status;
    const running = data.replayActive;
    const inIncident = status?.state?.status === "probable_outage" || status?.state?.status === "countdown";
    const helped = status?.state?.status === "resolved" && status.state.resolvedReason === "help";
    const live = data.transport === "twilio";
    body = (
      <div className="grid items-start gap-10 pt-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-14">
        <div className="min-w-0">
          <h1 className="font-display text-[32px] font-semibold leading-none tracking-[-0.03em]">Storm replay</h1>
          <p className="mt-3 flex items-center gap-2 text-[15px] text-ink-2">
            <span className={`h-2.5 w-2.5 rounded-full ${live ? "bg-ok" : "bg-info"}`} />
            {live
              ? data.inboundReady
                ? "Live. Real texts and calls go out, and replies come back."
                : "Live sends. Replies cannot reach this server until PUBLIC_BASE_URL is set."
              : "Simulated. No real phone is contacted; each message is logged instead."}
          </p>

          <fieldset disabled={running} className="mt-8">
            <legend className="label">Speed</legend>
            <div className="grid grid-cols-3 gap-1 rounded-full bg-surface-2 p-1">
              {data.speeds.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`h-11 cursor-pointer rounded-full text-[15px] font-semibold transition-colors disabled:cursor-not-allowed ${speed === s ? "bg-ink text-bg" : "text-muted hover:text-ink"}`}
                  onClick={() => setSpeed(s)}
                  aria-pressed={speed === s}
                >
                  {s}x
                </button>
              ))}
            </div>
            <p className="hint">At 120x a 4-hour backup runs down in about 2 minutes.</p>
          </fieldset>

          <fieldset disabled={running} className="mt-5">
            <legend className="label">Storm prompt to the resident</legend>
            <div className="grid grid-cols-2 gap-1 rounded-full bg-surface-2 p-1">
              {[
                { v: true, label: "Replied ready" },
                { v: false, label: "No reply" },
              ].map((o) => (
                <button
                  key={o.label}
                  type="button"
                  className={`h-11 cursor-pointer rounded-full text-[15px] font-semibold transition-colors disabled:cursor-not-allowed ${promptReplied === o.v ? "bg-ink text-bg" : "text-muted hover:text-ink"}`}
                  onClick={() => setPromptReplied(o.v)}
                  aria-pressed={promptReplied === o.v}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="hint">Sent before the outage. No reply raises the risk score, so the first alert asks for a call and the town volunteer is included.</p>
          </fieldset>

          <div className="mt-6 flex flex-wrap gap-3">
            <button className="btn btn-primary h-14 min-w-[220px] flex-1 text-[17px] disabled:opacity-100" onClick={() => act("run")} disabled={busy !== null || running}>
              {running ? (
                <>
                  <span className="h-2.5 w-2.5 animate-breathe rounded-full bg-danger" />
                  Running at {data.multiplier}x
                </>
              ) : (
                <>
                  <IconPlay className="h-4 w-4" />
                  {busy === "run" ? "Starting…" : "Run the storm"}
                </>
              )}
            </button>
            {running && (
              <button className="btn h-14" onClick={() => act("heartbeat")} disabled={busy !== null || !(inIncident || helped)}>
                Power back
              </button>
            )}
            <button className="btn h-14" onClick={() => act("reset")} disabled={busy !== null}>
              <IconReset className="h-4 w-4" />
              {busy === "reset" ? "Resetting…" : "Reset"}
            </button>
          </div>
          <details className="mt-5">
            <summary className="cursor-pointer text-[14px] font-semibold text-muted hover:text-ink">Options</summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label">Scenario</span>
              <select className="field" value={scenarioId} onChange={(e) => setScenarioId(e.target.value)} disabled={running}>
                {data.scenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Household</span>
              <select className="field" value={householdId} onChange={(e) => setHouseholdId(e.target.value)} disabled={running}>
                {data.households.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.label}, {h.town}
                  </option>
                ))}
              </select>
            </label>
          </div>

          </details>
          {actionError && (
            <p className="mt-4 rounded-xl bg-danger/10 px-4 py-3 font-semibold text-danger" role="alert">
              {actionError}
            </p>
          )}
          {stale && <p className="mt-3 text-[14px] font-semibold text-warn">Connection lost. Showing the last update.</p>}

          <div className="mt-10">{status && <EventLog events={status.events} title="Live event log" />}</div>

          {status?.warning && (
            <section className="mt-10">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="h-section">{status.warning.event}</h2>
                <button className="btn btn-sm" onClick={() => setShowRaw((v) => !v)}>
                  {showRaw ? "Hide alert data" : "Show alert data"}
                </button>
              </div>
              <p className="mt-1 text-[15px] text-muted">National Weather Service · {status.warning.headline ?? status.warning.event}</p>
              {showRaw && <pre className="mt-3 max-h-96 overflow-auto rounded-2xl bg-surface-2 p-5 text-[12px] leading-relaxed text-ink-2">{JSON.stringify(status.warning.raw, null, 2)}</pre>}
            </section>
          )}
        </div>

        {status && nowMs != null && (
          <div className="lg:sticky lg:top-20">
            <Phone className="!max-h-[calc(100dvh-140px)]">
              <HouseholdView
                data={status}
                nowMs={nowMs}
                framed
                banner={running ? `Storm replay · ${data.multiplier}x · simulated` : null}
                contactActions={(c) => {
                  const r = responderFor(c, status.alerts);
                  if (!running || !(inIncident || helped) || !r) return null;
                  return (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] text-muted">Reply as them</span>
                      {r.stage !== "arrived" && r.stage !== "on_way" && (
                        // With a location the drive time sets the arrival; without one, they say 20 min.
                        <button className="btn btn-sm" onClick={() => act("reply", { contactId: c.id, word: "OK", etaMinutes: c.lat != null ? null : 20 })} disabled={busy !== null}>
                          {c.lat != null ? "On my way" : "OK 20 · on my way"}
                        </button>
                      )}
                      {r.stage !== "arrived" && (
                        <button className="btn btn-sm" onClick={() => act("reply", { contactId: c.id, word: "CHECKED" })} disabled={busy !== null}>
                          {c.isTownVolunteer ? "CHECKED" : "HERE"}
                        </button>
                      )}
                      {inIncident && (
                        <button className="btn btn-sm !bg-danger/10 !text-danger" onClick={() => act("reply", { contactId: c.id, word: "HELP" })} disabled={busy !== null}>
                          HELP
                        </button>
                      )}
                    </div>
                  );
                }}
              />
            </Phone>
            <p className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[14px]">
              <Link className="link" href={`/h/${status.household.id}?from=replay`}>
                Open full screen
              </Link>
              {status.household.shareWithTown && (
                <Link className="link" href={`/town/${encodeURIComponent(status.household.town)}`}>
                  {status.household.town} roster
                </Link>
              )}
              {status.household.shareWithTown && (
                <Link className="link" href="/ems">
                  EMS board
                </Link>
              )}
            </p>
            {/* What each person on the list sees when they tap the link in their text. */}
            <p className="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[14px]">
              {status.contacts
                .filter((c) => c.linkKey && (!c.isTownVolunteer || status.household.shareWithTown))
                .map((c) => (
                  <Link key={c.id} className="link" href={`/r/${c.linkKey}`} target="_blank">
                    {c.name.replace(/\s*\(.*?\)/, "")} view
                  </Link>
                ))}
            </p>
          </div>
        )}
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
