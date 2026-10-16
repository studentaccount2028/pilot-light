// AI-assisted: written with Claude Code from the team's build spec.
"use client";
import { useState } from "react";
import type { SensorDto } from "./PowerCard";

// Pair or remove power modules. The module's secret is shown once, with the
// exact URL to put in its firmware.
export function SensorSetup({ householdId, sensors, onChanged }: { householdId: string; sensors: SensorDto[]; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paired, setPaired] = useState<{ label: string; token: string } | null>(null);

  async function pair() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/households/${householdId}/sensors`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: "Power module" }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not pair.");
      setPaired({ label: json.label, token: json.token });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not pair.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this power module? It will stop reporting to this household.")) return;
    await fetch(`/api/households/${householdId}/sensors/${id}`, { method: "DELETE" });
    onChanged();
  }

  const origin = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <section>
      <h2 className="h-section">Power module</h2>
      <p className="mt-1 text-[13px] leading-snug text-muted">A battery pack with a cell radio that plugs in between the wall and the medical device. It reports wall power, charging, charge left and battery health.</p>

      {sensors.length > 0 && (
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {sensors.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-3">
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-medium">{s.label}</span>
                <span className="block text-[13px] text-muted">{s.lastSeenAt ? "Reporting" : "Paired, no reports yet"}</span>
              </span>
              <button className="btn btn-sm" onClick={() => remove(s.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {paired ? (
        <div className="mt-3 space-y-2 rounded-xl border border-line bg-surface-2 p-4">
          <p className="text-[14px] font-semibold">Put this in the module&apos;s firmware. It is shown only once.</p>
          <p className="text-[12px] font-medium text-muted">Token</p>
          <code className="block break-all rounded-md bg-bg px-2.5 py-2 text-[12px]">{paired.token}</code>
          <p className="text-[12px] font-medium text-muted">Report URL (GET or POST)</p>
          <code className="block break-all rounded-md bg-bg px-2.5 py-2 text-[12px]">
            {origin}/api/sensor/report?t={paired.token}&amp;m=1&amp;v=121&amp;c=1&amp;b=87&amp;wh=256&amp;h=94&amp;w=45&amp;rssi=-91
          </code>
          <p className="text-[12px] leading-snug text-muted">Field list in docs/sensor.md. Send a report every few minutes, and immediately when wall power changes.</p>
          <button className="btn btn-sm" onClick={() => setPaired(null)}>
            Done
          </button>
        </div>
      ) : (
        <button className="btn mt-3 w-full" onClick={pair} disabled={busy}>
          {busy ? "Pairing…" : sensors.length ? "Pair another module" : "Pair a power module"}
        </button>
      )}
      {error && <p className="mt-2 text-[13px] font-medium text-danger">{error}</p>}
    </section>
  );
}
