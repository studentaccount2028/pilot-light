// AI-assisted: written with Claude Code from the team's build spec.
"use client";
import { useCallback, useEffect, useState } from "react";
import { fmtAgo } from "@/lib/client/format";
import { moduleStatus, type ReadingLike } from "@/lib/sensorStatus";
import { IconBattery, IconBolt, IconClock, IconPulse } from "./icons";

export interface SensorDto {
  id: string;
  label: string;
  createdAt: string;
  lastSeenAt: string | null;
  reading: (ReadingLike & { at: string }) | null;
  history: { at: string; batteryPct: number | null; mains: boolean | null }[];
}

// Reads the household's power modules and refreshes them every 15 seconds.
export function useSensors(householdId: string) {
  const [sensors, setSensors] = useState<SensorDto[] | null>(null);
  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/households/${householdId}/sensors`, { cache: "no-store" });
      if (res.ok) setSensors(((await res.json()) as { sensors: SensorDto[] }).sensors);
    } catch {
      // keep the last good reading when offline
    }
  }, [householdId]);
  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);
  return { sensors, reload: load };
}

function hm(hours: number): string {
  const m = Math.max(0, Math.round(hours * 60));
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}

// Battery percentage over the last reports, shaded where the wall was off.
function Spark({ history }: { history: SensorDto["history"] }) {
  const pts = history.filter((h) => h.batteryPct != null);
  if (pts.length < 2) return null;
  const W = 300;
  const H = 44;
  const t0 = Date.parse(pts[0].at);
  const t1 = Date.parse(pts[pts.length - 1].at);
  const x = (t: string) => (t1 === t0 ? 0 : ((Date.parse(t) - t0) / (t1 - t0)) * W);
  const y = (p: number) => H - 2 - (p / 100) * (H - 4);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(p.at).toFixed(1)},${y(p.batteryPct!).toFixed(1)}`).join(" ");
  // Merge consecutive "wall off" reports into one shaded band each.
  const off: { from: string; to: string }[] = [];
  history.forEach((h, i) => {
    if (h.mains !== false) return;
    const end = history[i + 1]?.at ?? h.at;
    const last = off[off.length - 1];
    if (last && last.to === h.at) last.to = end;
    else off.push({ from: h.at, to: end });
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-11 w-full" preserveAspectRatio="none" role="img" aria-label="Battery level over the last reports">
      {off.map((band) => (
        <rect key={band.from} x={x(band.from)} y={0} width={Math.max(2, x(band.to) - x(band.from))} height={H} fill="currentColor" className="text-surface-3" />
      ))}
      <path d={line} fill="none" stroke="currentColor" strokeWidth={1.5} className="text-ink" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 p-3">
      <p className="flex items-center gap-1.5 text-[12px] font-medium text-muted">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-[17px] font-semibold leading-tight tracking-[-0.02em] tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-[12px] leading-snug text-muted">{sub}</p>}
    </div>
  );
}

// One power module, the way a smart plug app shows a plug: wall power,
// charging, charge left, time left, battery health, signal, last report.
export function PowerCard({ sensor, nowMs }: { sensor: SensorDto; nowMs: number }) {
  const r = sensor.reading;
  const s = moduleStatus(r, new Date(nowMs));
  const pct = s.batteryPct == null ? null : Math.round(s.batteryPct);
  const off = s.wall === "off";

  return (
    <section className="mx-3 rounded-xl border border-line bg-surface">
      <div className="flex items-start justify-between gap-3 p-4 pb-0">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-muted">{sensor.label}</p>
          <p className="mt-1 text-[22px] font-semibold leading-tight tracking-[-0.025em]">{s.reporting || !r ? (off ? "Wall power is off" : s.wall === "on" ? "Wall power is on" : "Waiting for a report") : "Not reporting"}</p>
          <p className="mt-0.5 text-[13px] text-muted">
            {r ? `Last report ${fmtAgo(nowMs - Date.parse(r.at as string))}` : "Pair the module and switch it on."}
            {r?.simulated ? " · simulated data" : ""}
          </p>
        </div>
        <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[12px] font-semibold ${off ? "border-ink bg-ink text-bg" : "border-line bg-surface-2 text-ink-2"}`}>{s.chargeText}</span>
      </div>

      {r && (
        <>
          <div className="px-4 pt-4">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-medium text-muted">Battery</span>
              <span className="text-[13px] tabular-nums text-muted">{r.batteryVolts != null ? `${r.batteryVolts.toFixed(1)} V` : ""}</span>
            </div>
            <div className="mt-1 flex items-center gap-3">
              <span className="shrink-0 text-[28px] font-semibold leading-none tracking-[-0.03em] tabular-nums">{pct != null ? `${pct}%` : "–"}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3" role="presentation">
                <div className="h-full rounded-full bg-ink" style={{ width: `${pct ?? 0}%`, transition: "width 0.4s" }} />
              </div>
            </div>
            <Spark history={sensor.history} />
          </div>

          <div className="grid grid-cols-2 gap-2 p-4">
            <Stat icon={<IconBolt className="h-3.5 w-3.5" />} label="Wall power" value={s.wallText} sub={r.outputWatts != null ? `Device drawing ${Math.round(r.outputWatts)} W` : undefined} />
            <Stat
              icon={<IconClock className="h-3.5 w-3.5" />}
              label={off ? "Time left" : "Would last"}
              value={s.hoursLeft != null ? hm(s.hoursLeft) : "–"}
              sub={s.hoursLeft != null ? `at the current ${Math.round(r.outputWatts!)} W draw` : "Needs capacity and draw"}
            />
            <Stat
              icon={<IconBattery className="h-3.5 w-3.5" />}
              label="Battery health"
              value={s.health != null ? `${Math.round(s.health)}%` : "–"}
              sub={`${s.replaceText}${r.cycles != null ? ` · ${r.cycles} cycles` : ""}`}
            />
            <Stat
              icon={<IconPulse className="h-3.5 w-3.5" />}
              label="Cell signal"
              value={s.signal ? s.signal[0].toUpperCase() + s.signal.slice(1) : "–"}
              sub={[r.signalDbm != null ? `${r.signalDbm} dBm` : null, r.tempC != null ? `${Math.round(r.tempC)} °C` : null].filter(Boolean).join(" · ") || undefined}
            />
          </div>

          {(s.replace === "soon" || s.replace === "now") && (
            <p className="mx-4 mb-3 rounded-lg border border-ink/40 bg-surface-2 px-3 py-2.5 text-[13px] font-medium leading-snug">
              {s.replace === "now" ? "Replace the battery now." : "Plan to replace the battery soon."} It holds {Math.round(s.health ?? 0)}% of its original charge, so it will run out sooner than its label says.
            </p>
          )}
          {s.warnings.filter((w) => !w.startsWith("Battery capacity is below")).length > 0 && (
            <ul className="mx-4 mb-4 space-y-1.5">
              {s.warnings
                .filter((w) => !w.startsWith("Battery capacity is below"))
                .map((w) => (
                  <li key={w} className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-[13px] leading-snug text-ink-2">
                    {w}
                  </li>
                ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
