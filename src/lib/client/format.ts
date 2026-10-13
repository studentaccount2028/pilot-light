// AI-assisted: written with Claude Code from the team's build spec.
export function fmtCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function fmtAgo(ms: number): string {
  if (ms < 60_000) return "just now";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h ${min % 60} min ago`;
  return `${Math.floor(h / 24)} days ago`;
}

export function fmtClock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

export function fmtHours(hours: number | null): string {
  if (hours == null || hours <= 0) return "No backup";
  return `${hours} h backup`;
}

const HOUR = 3_600_000;
// Time left on one device, given when the outage is assumed to have started.
export function deviceRemainingMs(backupHours: number | null, outageInferredAt: string | null, nowMs: number): number | null {
  if (!outageInferredAt) return null;
  return (backupHours ?? 0) * HOUR - (nowMs - Date.parse(outageInferredAt));
}
