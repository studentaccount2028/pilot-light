// AI-assisted: written with Claude Code from the team's build spec.
"use client";
import type { NearbySiteDto, RiskDto, Tier } from "@/lib/client/types";
import { IconBattery, IconCalendar, IconDoor, IconMessage, IconPhone, IconPlug, IconUser } from "./icons";

export const TIER_NAME: Record<Tier, string> = { stable: "Stable", check: "Check", check_first: "Check first" };
export const TIER_CHIP: Record<Tier, string> = {
  stable: "border-ok/30 bg-ok/10 text-ok",
  check: "border-warn/30 bg-warn/10 text-warn",
  check_first: "border-danger/35 bg-danger/12 text-danger",
};
const TIER_MEANS: Record<Tier, string> = {
  stable: "Contacts are alerted in order as the backup runs down.",
  check: "The first alert goes out as soon as the outage is inferred, with the town volunteer included.",
  check_first: "Everyone is alerted at once, and the message leads with 911 guidance.",
};
export function TierChip({ tier, plain = false }: { tier: Tier; plain?: boolean }) {
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[12px] font-semibold ${plain ? "border-line bg-surface-2 text-ink" : TIER_CHIP[tier]}`}>{TIER_NAME[tier]}</span>
  );
}

// Each factor has its own icon, so a row says what it is about before it is read.
const FACTOR_ICON: Record<string, (p: React.SVGProps<SVGSVGElement>) => React.ReactElement> = {
  mobility: IconDoor,
  alone: IconUser,
  age: IconCalendar,
  backup: IconBattery,
  reach: IconPlug,
  prompt: IconMessage,
};

// One factor as a full-width row: its icon, the label, and its points if it has any.
function Row({ factor, label, points }: { factor: string; label: string; points?: string }) {
  const Icon = FACTOR_ICON[factor] ?? IconUser;
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="tile">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1 text-[15px] leading-snug text-ink">{label}</span>
      {points && <span className="shrink-0 text-[15px] font-semibold tabular-nums text-ink-2">{points}</span>}
    </li>
  );
}

function Block({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <p className="flex items-center justify-between text-[13px] font-medium text-muted">
        {title}
        {count != null && <span className="tabular-nums">{count}</span>}
      </p>
      {children}
    </section>
  );
}

// Four blocks, top to bottom: the score, who to contact, what needs
// attention, what is in place. One neutral palette throughout.
export function RiskCard({ risk, residentName, nearby }: { risk: RiskDto; residentName: string | null; nearby: NearbySiteDto[] }) {
  const open = risk.factors.filter((f) => f.state !== "ok");
  const done = risk.factors.filter((f) => f.state === "ok");
  const fire = nearby.find((s) => s.kind === "fire");
  const police = nearby.find((s) => s.kind === "police");
  const emergency = risk.recommended?.phone === "911";

  return (
    <div className="space-y-2.5">
      <Block title={`Risk score${residentName ? ` · ${residentName}` : ""}`}>
        <div className="mt-2 flex items-end justify-between gap-3">
          <p className="text-[52px] font-semibold leading-[0.9] tracking-[-0.04em] tabular-nums">{risk.score}</p>
          <TierChip tier={risk.tier} plain />
        </div>
        <p className="mt-3 text-[13px] leading-snug text-muted">{TIER_MEANS[risk.tier]}</p>
        <p className="mt-1 text-[12px] leading-snug text-muted">3 or more is Check, 6 or more is Check first. Not a medical assessment.</p>
      </Block>

      {risk.recommended && (
        <Block title="Recommended contact">
          <div className="mt-2 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[17px] font-semibold tracking-[-0.02em]">{emergency ? "911 and local authorities" : risk.recommended.name}</p>
              <p className="mt-0.5 text-[13px] leading-snug text-muted">{risk.recommended.why}</p>
            </div>
            <a href={`tel:${risk.recommended.phone}`} className={`flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[#e6e6e6] text-[14px] font-semibold text-[#08090a] ${emergency ? "px-3.5" : "w-11"}`} aria-label={`Call ${risk.recommended.name}`}>
              <IconPhone className="h-4 w-4" />
              {emergency && "911"}
            </a>
          </div>
          {emergency && (fire || police) && (
            <ul className="mt-3 grid grid-cols-2 gap-2">
              {[fire, police].map(
                (s) =>
                  s && (
                    <li key={s.kind} className="rounded-lg border border-line bg-surface-2 p-3">
                      <p className="text-[15px] font-semibold tabular-nums">{s.estimated ? "about " : ""}{s.minutes} min</p>
                      <p className="mt-1 text-[13px] leading-snug text-ink-2">{s.name}</p>
                    </li>
                  ),
              )}
            </ul>
          )}
        </Block>
      )}

      <Block title="Needs attention" count={open.length}>
        {open.length === 0 ? (
          <p className="mt-2 text-[14px] text-ink-2">Nothing open.</p>
        ) : (
          <ul className="-mb-2 mt-1 divide-y divide-line">
            {open.map((f) => (
              <Row key={f.key} factor={f.key} label={f.label} points={f.points > 0 ? `+${f.points}` : undefined} />
            ))}
          </ul>
        )}
      </Block>

      <Block title="In place" count={done.length}>
        {done.length === 0 ? (
          <p className="mt-2 text-[14px] text-ink-2">Nothing confirmed yet.</p>
        ) : (
          <ul className="-mb-2 mt-1 divide-y divide-line">
            {done.map((f) => (
              <Row key={f.key} factor={f.key} label={f.label} points={f.points < 0 ? String(f.points) : undefined} />
            ))}
          </ul>
        )}
      </Block>
    </div>
  );
}
