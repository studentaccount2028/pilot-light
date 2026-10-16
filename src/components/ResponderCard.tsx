// AI-assisted: written with Claude Code from the team's build spec.
"use client";
import type { ContactDto } from "@/lib/client/types";
import { fmtTime, minutesAway, type Responder } from "@/lib/client/responders";
import { IconMessage, IconMore, IconPhone } from "./icons";

const initials = (name: string) =>
  name
    .replace(/\(.*?\)/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";

const firstName = (name: string) => name.replace(/\(.*?\)/g, "").trim().split(/\s+/)[0] || name;

function span(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
}

// The headline and the line under it, by stage.
function lines(r: Responder, nowMs: number): { big: string; small: string; tone: string } {
  const by = r.alertedBy === "sms" ? "Texted" : "Called";
  switch (r.stage) {
    case "arrived":
      return { big: "Arrived", small: `At the house since ${fmtTime(r.arrivedAt!)}`, tone: "text-ok" };
    case "on_way": {
      const left = minutesAway(r.etaAt!, nowMs);
      return left != null
        ? { big: `${span(left)} away`, small: `On the way · arrives ${fmtTime(r.etaAt!)}`, tone: "" }
        : { big: "Should be there", small: `Was due at ${fmtTime(r.etaAt!)} · waiting for HERE`, tone: "text-warn" };
    }
    case "help":
      return { big: "Asked for help", small: `Replied HELP at ${fmtTime(r.seenAt!)}`, tone: "text-danger" };
    case "seen":
      return { big: "Saw the alert", small: `Replied OK at ${fmtTime(r.seenAt!)} · no arrival time`, tone: "" };
    default:
      return { big: "Waiting for reply", small: `${by} at ${fmtTime(r.alertedAt!)}`, tone: "text-muted" };
  }
}

const STEPS = ["Alerted", "Seen", "On the way", "Arrived"] as const;
const REACHED: Record<Responder["stage"], number> = { alerted: 0, seen: 1, help: 1, on_way: 2, arrived: 3 };

// The person on their way to the house, shown the way a ride app shows a
// driver: who, how far out, when they arrive, and the steps so far.
export function ResponderCard({
  responder,
  fallback,
  peopleLine,
  nowMs,
  onMore,
}: {
  responder: Responder | null;
  fallback: ContactDto;
  peopleLine: string;
  nowMs: number;
  onMore: () => void;
}) {
  const c = responder?.contact ?? fallback;
  const r = responder;
  const l = r ? lines(r, nowMs) : { big: "Not contacted", small: "No alert has gone out", tone: "text-muted" };
  const reached = r ? REACHED[r.stage] : -1;

  // How much of the trip is done, from the reply to the arrival time.
  let trip: number | null = null;
  if (r?.stage === "on_way" && r.seenAt) {
    const start = Date.parse(r.seenAt);
    const end = Date.parse(r.etaAt!);
    trip = end > start ? Math.max(0.04, Math.min(1, (nowMs - start) / (end - start))) : 1;
  } else if (r?.stage === "arrived") trip = 1;

  return (
    <section className="mx-3 rounded-xl border border-line bg-surface p-4" aria-live="polite">
      <div className="flex items-center gap-3.5">
        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-[15px] font-semibold">
          {initials(c.name)}
          {r && <span className={`absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full ring-[3px] ring-surface ${DOT[r.stage]}`} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-ink-2">{c.name}</p>
          <p className={`text-[20px] font-semibold leading-tight tracking-[-0.02em] tabular-nums ${l.tone}`}>{l.big}</p>
          <p className="truncate text-[13px] text-muted">{l.small}</p>
        </div>
      </div>

      {trip != null && (
        <div className="mt-3.5 h-1 overflow-hidden rounded-full bg-surface-3" role="presentation">
          <div className={`h-full rounded-full ${r?.stage === "arrived" ? "bg-ok" : "bg-ink"}`} style={{ width: `${trip * 100}%`, transition: "width 0.3s linear" }} />
        </div>
      )}

      {r && (
        <ol className="mt-3.5 grid grid-cols-4 gap-1" aria-label="Progress">
          {STEPS.map((s, i) => {
            const done = i <= reached;
            const red = r.stage === "help" && i === 1;
            return (
              <li key={s} className="min-w-0">
                <span className={`block h-1 rounded-full ${red ? "bg-danger" : done ? (r.stage === "arrived" ? "bg-ok" : "bg-ink") : "bg-surface-3"}`} />
                <span className={`mt-1.5 block truncate text-[11px] font-medium ${done ? "text-ink-2" : "text-muted"}`}>{red ? "HELP" : s}</span>
              </li>
            );
          })}
        </ol>
      )}

      <p className="mt-3 text-[13px] text-muted">{peopleLine}</p>

      {/* Ride-app style: message and call the person coming, with 911 one tap away. */}
      <div className="mt-3 flex items-center gap-2">
        <a href={`sms:${c.phone}`} className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full border border-line bg-surface-2 px-4 text-[14px] font-medium text-muted">
          <IconMessage className="h-5 w-5 shrink-0 text-ink" />
          <span className="truncate">Message {firstName(c.name)}</span>
        </a>
        <a href={`tel:${c.phone}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2" aria-label={`Call ${c.name}`}>
          <IconPhone className="h-5 w-5" />
        </a>
        <a href="tel:911" className="flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full bg-danger px-3.5 text-[14px] font-semibold text-white" aria-label="Call 911">
          <IconPhone className="h-4 w-4" />
          911
        </a>
        <button onClick={onMore} className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line bg-surface-2" aria-label="Everyone who gets contacted">
          <IconMore className="h-5 w-5" />
        </button>
      </div>
    </section>
  );
}

const DOT: Record<Responder["stage"], string> = {
  alerted: "bg-warn animate-breathe",
  seen: "bg-info",
  help: "bg-danger",
  on_way: "bg-ink animate-breathe",
  arrived: "bg-ok",
};
