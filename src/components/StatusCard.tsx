// AI-assisted: written with Claude Code from the team's build spec.
"use client";
import { fmtAgo } from "@/lib/client/format";
import type { StatusDto } from "@/lib/client/types";

export type Tone = "calm" | "setup" | "watch" | "alarm" | "ok";

export function toneOf(data: StatusDto): Tone {
  const s = data.state?.status ?? "normal";
  if (s === "probable_outage" || s === "countdown") return "alarm";
  if (s === "resolved") return data.state?.resolvedReason === "help" ? "alarm" : "ok";
  if (!data.state?.lastHeartbeatAt) return "setup";
  if (s === "warning_active") return "watch";
  return "calm";
}

export const TONE_COLOR: Record<Tone, string> = { calm: "#828fff", setup: "#f2c94c", watch: "#f2c94c", alarm: "#eb5757", ok: "#4cb782" };

// One tinted band per state: a quiet fill, a hairline, boxed values.
const BAND: Record<Tone, string> = {
  calm: "bg-info/10 text-info border-info/25",
  setup: "bg-warn/10 text-warn border-warn/25",
  watch: "bg-warn/10 text-warn border-warn/25",
  alarm: "bg-danger/12 text-danger border-danger/30",
  ok: "bg-ok/10 text-ok border-ok/25",
};
const BOX: Record<Tone, string> = {
  calm: "bg-info/20 text-ink",
  setup: "bg-warn/20 text-ink",
  watch: "bg-warn/20 text-ink",
  alarm: "bg-danger/25 text-ink",
  ok: "bg-ok/20 text-ink",
};

export interface Summary {
  tone: Tone;
  counting: boolean;
  out: boolean;
  helped: boolean;
  remainingMs: number | null;
  fraction: number;
  // The one-line title at the top of Home, like "Pick-up in 4 min".
  headline: string;
  // The band under it: a label and a few boxed values.
  band: { label: string; boxes: string[] };
  // The bold sentence in the Details block.
  statement: string;
  lastHeard: string;
  weather: string;
}

function span(ms: number): string {
  const min = Math.max(0, Math.ceil(ms / 60_000));
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

// Everything Home says about the household, derived in one place.
export function summarize(data: StatusDto, nowMs: number): Summary {
  const state = data.state;
  const status = state?.status ?? "normal";
  const tone = toneOf(data);
  const h = data.household;
  const counting = status === "probable_outage" || status === "countdown";
  const zero = state?.countdownZeroAt ? Date.parse(state.countdownZeroAt) : null;
  const remainingMs = counting && zero != null ? zero - nowMs : null;
  const out = counting && remainingMs != null && remainingMs <= 0;
  const helped = status === "resolved" && state?.resolvedReason === "help";
  const total = data.limitingHours * 3_600_000;
  const fraction = counting && total > 0 && remainingMs != null ? Math.max(0, Math.min(1, remainingMs / total)) : 0;
  const device = (data.devices.find((d) => d.id === data.limitingDeviceId)?.label ?? "backup power").replace(/^./, (c) => c.toLowerCase());
  const zone = h.zoneName ?? h.nwsZone;

  const base = {
    tone,
    counting,
    out,
    helped,
    remainingMs,
    fraction,
    lastHeard: state?.lastHeartbeatAt ? `Heard from ${fmtAgo(nowMs - Date.parse(state.lastHeartbeatAt))}` : "Never heard from",
    weather: data.warning ? data.warning.event : "No storm warning",
  };

  if (counting) {
    const t = Math.max(0, Math.floor((remainingMs ?? 0) / 1000));
    const boxes = [String(Math.floor(t / 3600)), String(Math.floor((t % 3600) / 60)).padStart(2, "0"), String(t % 60).padStart(2, "0")];
    return out
      ? { ...base, headline: "Backup has likely run out", band: { label: "Time left", boxes }, statement: `Call 911 if no one has reached ${h.label}. Every contact has been alerted.` }
      : { ...base, headline: `Backup runs out in ${span(remainingMs ?? 0)}`, band: { label: "Time left", boxes }, statement: `Power appears out at ${h.label}. The ${device} is on backup. Check with a call or a visit.` };
  }
  if (helped) return { ...base, headline: "Help was requested", band: { label: "A contact replied HELP", boxes: ["911"] }, statement: `${h.label} needs help. The other contacts have been told.` };
  if (status === "resolved") return { ...base, headline: "Back in contact", band: { label: "All-clear sent", boxes: ["OK"] }, statement: `${h.label} has checked in again. Everyone who was alerted has been told.` };
  if (tone === "setup") return { ...base, headline: "Finish setup", band: { label: "Not monitoring yet", boxes: ["OFF"] }, statement: "No phone at the house is checking in, so an outage can't be detected. Turn it on in the House tab." };
  if (status === "warning_active") return { ...base, headline: "Storm warning in force", band: { label: "Starts the clock after", boxes: ["20", "MIN"] }, statement: `${data.warning?.event ?? "A storm warning"} for ${zone}. If the phone at the house goes quiet, the clock starts.` };
  return { ...base, headline: "No storm warning", band: { label: "Monitoring", boxes: ["ON"] }, statement: `Watching ${h.label} in ${h.town}. Nothing in force for ${zone}.` };
}

// The status band: a solid strip with a label and boxed values.
export function StatusBand({ summary, onClick }: { summary: Summary; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} className={`flex w-full items-center justify-between gap-3 border-t px-4 py-3 text-left ${BAND[summary.tone]} ${onClick ? "cursor-pointer" : ""}`} aria-live="polite">
      <span className="text-[14px] font-medium">{summary.band.label}</span>
      <span className="flex items-center gap-1.5" aria-label={summary.band.boxes.join(" ")}>
        {summary.band.boxes.map((b, i) => (
          <span key={i} className={`flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-[14px] font-semibold tabular-nums ${BOX[summary.tone]}`}>
            {b}
          </span>
        ))}
      </span>
    </Tag>
  );
}
