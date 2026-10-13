// AI-assisted: written with Claude Code from the team's build spec.
"use client";
import { useState } from "react";
import { deviceRemainingMs, fmtCountdown, fmtHours } from "@/lib/client/format";
import { sendOrQueue } from "@/lib/client/queue";
import type { StatusDto } from "@/lib/client/types";
import { IconBolt } from "./icons";

// Each device with a runtime bar, and a quick way to correct its backup
// hours. The correction is stored on the phone if the network is down.
export function DeviceList({ data, nowMs, onChanged }: { data: StatusDto; nowMs: number; onChanged?: () => void }) {
  const inIncident = data.state?.status === "probable_outage" || data.state?.status === "countdown";
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(id: string) {
    setBusy(true);
    setNote(null);
    try {
      const result = await sendOrQueue(`/api/devices/${id}`, "PATCH", { backupHours: value === "" ? null : Number(value) });
      setNote(result === "queued" ? "Saved on this phone. It will be sent when you are back online." : null);
      setEditing(null);
      onChanged?.();
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 className="text-[13px] font-medium text-muted">Devices</h2>
      <ul className="mt-1 divide-y divide-line">
        {data.devices.map((d) => {
          const remaining = inIncident ? deviceRemainingMs(d.backupHours, data.state!.outageInferredAt, nowMs) : null;
          const total = (d.backupHours ?? 0) * 3_600_000;
          const fraction = remaining == null ? 1 : total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
          const none = d.backupHours == null || d.backupHours <= 0;
          const tone = none || fraction === 0 ? "danger" : fraction < 0.5 ? "warn" : "ok";
          const bar = { danger: "bg-danger", warn: "bg-warn", ok: "bg-ink" }[tone];
          const tile = { danger: "bg-danger/10 text-danger", warn: "bg-surface-2 text-ink", ok: "bg-surface-2 text-ink" }[tone];
          const sets = d.id === data.limitingDeviceId && data.devices.length > 1;
          return (
            <li key={d.id} className="py-3.5">
              <div className="flex items-center gap-3.5">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line ${tile}`}>
                  <IconBolt className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate text-[15px] font-medium">{d.label}</p>
                    <p className="shrink-0 text-[15px] font-medium tabular-nums">
                      {remaining != null ? (remaining > 0 ? fmtCountdown(remaining) : "Out") : none ? "None" : `${d.backupHours} h`}
                    </p>
                  </div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3" role="presentation">
                    <div className={`h-full rounded-full ${bar}`} style={{ width: `${none ? 100 : Math.max(3, fraction * 100)}%`, transition: "width 0.3s linear" }} />
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[13px] text-muted">
                    <span>
                      {remaining != null ? `of ${fmtHours(d.backupHours).toLowerCase()}` : fmtHours(d.backupHours)}
                      {sets && <span className="ml-2 font-semibold text-ink">· sets the clock</span>}
                    </span>
                    {editing !== d.id && (
                      <button
                        className="link text-[13px]"
                        onClick={() => {
                          setEditing(d.id);
                          setValue(d.backupHours == null ? "" : String(d.backupHours));
                        }}
                      >
                        Update hours
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {editing === d.id && (
                <form
                  className="mt-3 animate-rise rounded-2xl bg-surface-2 p-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    save(d.id);
                  }}
                >
                  <label className="block">
                    <span className="label">Hours on a full charge (blank = none)</span>
                    <input className="field !bg-surface-3" type="number" inputMode="decimal" min={0} max={720} step="0.5" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
                  </label>
                  <div className="mt-2 flex gap-2">
                    <button className="btn btn-primary flex-1" disabled={busy}>
                      {busy ? "Saving" : "Save"}
                    </button>
                    <button type="button" className="btn" onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </li>
          );
        })}
      </ul>
      {note && <p className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-[14px] font-semibold text-warn">{note}</p>}
    </section>
  );
}
