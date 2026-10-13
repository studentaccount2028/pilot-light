// AI-assisted: written with Claude Code from the team's build spec.
"use client";
import { fmtClock } from "@/lib/client/format";
import type { EventDto } from "@/lib/client/types";

const DOT: Record<string, string> = {
  probable_outage: "bg-danger",
  countdown: "bg-danger",
  threshold: "bg-danger",
  help: "bg-danger",
  send_failed: "bg-danger",
  sent: "bg-ink",
  resolved: "bg-ok",
  ack: "bg-ok",
  checked: "bg-ok",
  replay: "bg-info",
  warning_active: "bg-warn",
};
const LABEL: Record<string, string> = {
  probable_outage: "Outage inferred",
  countdown: "Countdown started",
  threshold: "Threshold crossed",
  help: "Help requested",
  send_failed: "Send failed",
  sent: "Message sent",
  resolved: "Resolved",
  ack: "Reply received",
  checked: "Checked in person",
  replay: "Replay",
  warning_active: "Storm warning",
  normal: "Back to normal",
  battery_edit: "Battery updated",
  opt_out: "Opted out",
};

export function EventLog({ events, title, limit }: { events: EventDto[]; title?: string; limit?: number }) {
  const shown = limit ? events.slice(0, limit) : events;
  return (
    <section>
      {title && <h2 className="h-section mb-3">{title}</h2>}
      {shown.length === 0 ? (
        <p className="text-[15px] leading-snug text-muted">Nothing yet. Each state change, message and reply shows up here as it happens.</p>
      ) : (
        <ol>
          {shown.map((e, i) => (
            <li key={e.id} className="relative flex animate-rise gap-3.5 pb-4 last:pb-0">
              {i < shown.length - 1 && <span className="absolute left-[4.5px] top-4 h-full w-px bg-line" aria-hidden />}
              <span className={`relative mt-[7px] h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-bg ${DOT[e.kind] ?? "bg-surface-3"}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline justify-between gap-3">
                  <span className="text-[14px] font-medium">{LABEL[e.kind] ?? e.kind.replace(/_/g, " ")}</span>
                  <time className="shrink-0 text-[13px] tabular-nums text-muted">{fmtClock(e.at)}</time>
                </p>
                <p className="mt-0.5 break-words text-[13px] leading-snug text-muted">{e.message}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
