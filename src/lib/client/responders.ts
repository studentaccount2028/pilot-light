// AI-assisted: written with Claude Code from the team's build spec.
// Where each contact is in answering an alert, like a ride's progress:
// alerted, seen (replied), on the way (with an arrival time), arrived.
import type { AlertDto, ContactDto } from "./types";

export type Stage = "alerted" | "seen" | "help" | "on_way" | "arrived";

export interface Responder {
  contact: ContactDto;
  stage: Stage;
  alertedAt: string | null;
  alertedBy: "sms" | "voice";
  seenAt: string | null;
  etaAt: string | null;
  arrivedAt: string | null;
}

const latest = (xs: (string | null)[]) => xs.filter((x): x is string => !!x).sort().at(-1) ?? null;
const earliest = (xs: (string | null)[]) => xs.filter((x): x is string => !!x).sort()[0] ?? null;

// One contact's alerts for this incident, folded into one line of progress.
// Null if they have not been reached yet.
export function responderFor(contact: ContactDto, alerts: AlertDto[]): Responder | null {
  const mine = alerts.filter((a) => a.contactId === contact.id && a.threshold !== "all_clear");
  const sent = mine.filter((a) => a.sid);
  if (sent.length === 0) return null;
  const first = sent.slice().sort((a, b) => (a.sentAt ?? "").localeCompare(b.sentAt ?? ""))[0];
  const acked = mine.filter((a) => a.ackAt).sort((a, b) => a.ackAt!.localeCompare(b.ackAt!));
  const arrivedAt = latest(mine.map((a) => a.arrivedAt));
  const etaAt = acked.filter((a) => a.etaAt).at(-1)?.etaAt ?? null;
  const help = acked.some((a) => a.ackBody === "HELP");
  const stage: Stage = arrivedAt ? "arrived" : etaAt ? "on_way" : help ? "help" : acked.length ? "seen" : "alerted";
  return {
    contact,
    stage,
    alertedAt: earliest(sent.map((a) => a.sentAt)),
    alertedBy: first.channel,
    seenAt: earliest(acked.map((a) => a.ackAt)),
    etaAt,
    arrivedAt,
  };
}

export function respondersFor(contacts: ContactDto[], alerts: AlertDto[]): Responder[] {
  return contacts.map((c) => responderFor(c, alerts)).filter((r): r is Responder => r !== null);
}

// Who to feature on Home: whoever is closest to the door.
// On the way (soonest first), then arrived, then replied, then most recently alerted.
const RANK: Record<Stage, number> = { on_way: 0, arrived: 1, help: 2, seen: 3, alerted: 4 };
export function leadResponder(rs: Responder[]): Responder | null {
  return (
    rs.slice().sort((a, b) => {
      if (RANK[a.stage] !== RANK[b.stage]) return RANK[a.stage] - RANK[b.stage];
      if (a.stage === "on_way") return a.etaAt!.localeCompare(b.etaAt!);
      if (a.stage === "arrived") return b.arrivedAt!.localeCompare(a.arrivedAt!);
      return (b.alertedAt ?? "").localeCompare(a.alertedAt ?? "");
    })[0] ?? null
  );
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// "12 min", "1 h 5 min" until the arrival time; null once it has passed.
export function minutesAway(etaAt: string, nowMs: number): number | null {
  const ms = Date.parse(etaAt) - nowMs;
  return ms > 0 ? Math.ceil(ms / 60_000) : null;
}
