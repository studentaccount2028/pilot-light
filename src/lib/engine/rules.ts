// AI-assisted: written with Claude Code from the team's build spec.
// The outage rules as pure functions: no database, no network, no clock.
// tick.ts feeds these real rows; the tests feed them fixtures.
//
// The server never knows the power is out. It infers it from two signals
// agreeing: an active NWS warning over the household's zone, and the household
// phone going silent. Either one alone does nothing.

export const WARNING_EVENTS = [
  "Winter Storm Warning",
  "Ice Storm Warning",
  "High Wind Warning",
  "Blizzard Warning",
] as const;

import type { Tier } from "./risk";

export const SILENCE_MS = 20 * 60_000;
const HOUR = 3_600_000;

export type Status = "normal" | "warning_active" | "probable_outage" | "countdown" | "resolved";
export type Threshold = "h6" | "h2" | "h0";

export interface AlertLike {
  id: string;
  event: string;
  zones: string[];
  onset: Date;
  expires: Date;
}

export interface DeviceLike {
  label: string;
  backupHours: number | null;
}

export interface ContactLike {
  id: string;
  priority: number;
  channel: "sms" | "voice" | "both";
  isTownVolunteer: boolean;
  active: boolean;
}

export interface StateLike {
  status: Status;
  outageInferredAt: Date | null;
  countdownZeroAt: Date | null;
  lastHeartbeatAt: Date | null;
  activeAlertId: string | null;
  resolvedReason: string | null;
}

export interface Decision extends StateLike {
  // Threshold whose alerts should exist right now, if any.
  fire: Threshold | null;
  // Send the all-clear for the incident keyed by outageInferredAt.
  allClear: boolean;
  // Human-readable transitions for the event log.
  transitions: { kind: string; message: string }[];
}

// Rule 1: a qualifying warning covers this zone right now.
export function findActiveWarning<A extends AlertLike>(alerts: A[], zone: string, now: Date): A | null {
  const live = alerts.filter(
    (a) =>
      (WARNING_EVENTS as readonly string[]).includes(a.event) &&
      a.zones.includes(zone) &&
      a.onset.getTime() <= now.getTime() &&
      now.getTime() < a.expires.getTime(),
  );
  if (live.length === 0) return null;
  // Deterministic pick when warnings overlap: the one that started first.
  return live.sort((a, b) => a.onset.getTime() - b.onset.getTime() || a.id.localeCompare(b.id))[0];
}

// Rule 2: the household phone has been quiet for more than 20 minutes.
// A household that has never sent a heartbeat has no baseline, so it is not
// "silent"; the UI tells the family it is not being monitored yet.
export function isSilent(lastHeartbeatAt: Date | null, now: Date): boolean {
  if (!lastHeartbeatAt) return false;
  return now.getTime() - lastHeartbeatAt.getTime() > SILENCE_MS;
}

// Rule 4: the shortest backup decides. No backup (null) means zero runtime.
export function limitingDevice<D extends DeviceLike>(devices: D[]): { device: D | null; hours: number } {
  let best: D | null = null;
  let hours = Infinity;
  for (const d of devices) {
    const h = d.backupHours == null || d.backupHours < 0 ? 0 : d.backupHours;
    if (h < hours) {
      hours = h;
      best = d;
    }
  }
  return { device: best, hours: best ? hours : 0 };
}

// Rule 5: the most severe threshold already crossed. Only that one fires, so
// a household that starts at zero gets the 0 h message, not three at once.
export function activeThreshold(remainingMs: number): Threshold | null {
  if (remainingMs <= 0) return "h0";
  if (remainingMs <= 2 * HOUR) return "h2";
  if (remainingMs <= 6 * HOUR) return "h6";
  return null;
}

// Who hears about each threshold, by risk tier.
//   stable       6 h: first contact. 2 h: first two. 0 h: everyone plus the town volunteer.
//   check        the town volunteer is added from the first alert.
//   check first  everyone, volunteer included, at every threshold.
// Volunteers are only ever contacted if the household opted in to sharing with the town.
export function recipientsFor<C extends ContactLike>(threshold: Threshold, contacts: C[], shareWithTown: boolean, tier: Tier = "stable"): C[] {
  const active = contacts.filter((c) => c.active);
  const family = active.filter((c) => !c.isTownVolunteer);
  const volunteers = shareWithTown ? active.filter((c) => c.isTownVolunteer) : [];
  if (tier === "check_first" || threshold === "h0") return [...family, ...volunteers];
  const upTo = threshold === "h6" ? 1 : 2;
  const firstFew = family.filter((c) => c.priority <= upTo);
  return tier === "check" ? [...firstFew, ...volunteers] : firstFew;
}

export function channelsFor(contact: Pick<ContactLike, "channel">): ("sms" | "voice")[] {
  if (contact.channel === "both") return ["sms", "voice"];
  return [contact.channel];
}

function hasHeartbeatSince(state: StateLike): boolean {
  return (
    state.lastHeartbeatAt != null &&
    state.outageInferredAt != null &&
    state.lastHeartbeatAt.getTime() > state.outageInferredAt.getTime()
  );
}

// One evaluation of one household. Called every tick and on every heartbeat.
export function decide(input: {
  now: Date;
  state: StateLike;
  warning: AlertLike | null;
  devices: DeviceLike[];
  // Higher tiers do not wait for the 6 h mark: the first alert goes out as
  // soon as the outage is inferred.
  tier?: Tier;
}): Decision {
  const { now, state, warning, devices } = input;
  const tier = input.tier ?? "stable";
  const out: Decision = { ...state, fire: null, allClear: false, transitions: [] };
  const say = (kind: string, message: string) => out.transitions.push({ kind, message });

  const inIncident = state.status === "probable_outage" || state.status === "countdown";

  if (inIncident) {
    // Rule 6: any heartbeat during an incident resolves it.
    if (hasHeartbeatSince(state)) {
      out.status = "resolved";
      out.resolvedReason = "heartbeat";
      out.allClear = true;
      say("resolved", "Heartbeat received. Household is back in contact.");
      return out;
    }
    return runCountdown(out, now, devices, tier, say);
  }

  if (state.status === "resolved" && state.resolvedReason === "help") {
    // Rule 7: after HELP, stop escalating. Hold here until the phone comes
    // back or the warning ends, so the same storm cannot re-open the incident.
    if (hasHeartbeatSince(state)) {
      out.allClear = true;
      say("resolved", "Heartbeat received. Household is back in contact.");
    } else if (warning) {
      return out;
    }
  }

  // Not in an incident: rule 3 decides whether one starts.
  if (warning && isSilent(state.lastHeartbeatAt, now)) {
    // Assume the power died when the phone went quiet, but never before the
    // warning began: a phone that was already off is not evidence of this storm.
    const inferred = new Date(Math.max(state.lastHeartbeatAt!.getTime(), warning.onset.getTime()));
    out.status = "probable_outage";
    out.outageInferredAt = inferred;
    out.activeAlertId = warning.id;
    out.resolvedReason = null;
    say("probable_outage", `Probable outage: ${warning.event} is active and the household phone has been silent for over 20 minutes.`);
    return runCountdown(out, now, devices, tier, say);
  }

  const next: Status = warning ? "warning_active" : "normal";
  if (next !== state.status) {
    say(
      next,
      warning ? `${warning.event} is active for this zone. Watching for silence.` : "No active warning. Back to normal.",
    );
  }
  out.status = next;
  out.activeAlertId = warning ? warning.id : null;
  out.countdownZeroAt = null;
  out.resolvedReason = null;
  return out;
}

function runCountdown(
  out: Decision,
  now: Date,
  devices: DeviceLike[],
  tier: Tier,
  say: (kind: string, message: string) => void,
): Decision {
  // Recomputed every tick so a battery figure edited mid-outage takes effect.
  const { hours } = limitingDevice(devices);
  const zero = new Date(out.outageInferredAt!.getTime() + hours * HOUR);
  out.countdownZeroAt = zero;
  const threshold = activeThreshold(zero.getTime() - now.getTime()) ?? (tier === "stable" ? null : "h6");
  if (threshold && out.status !== "countdown") {
    say("countdown", `Countdown running. Backup runs out at ${zero.toISOString()}.`);
  }
  out.status = threshold ? "countdown" : "probable_outage";
  out.fire = threshold;
  return out;
}
