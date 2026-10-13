// AI-assisted: written with Claude Code from the team's build spec.
"use client";
import type { NearbySiteDto } from "@/lib/client/types";
import { IconFlame, IconHospital, IconShield } from "./icons";

export const SITE_LABEL: Record<NearbySiteDto["kind"], string> = { fire: "Fire / rescue", police: "Police", hospital: "Hospital" };
export const SITE_COLOR: Record<NearbySiteDto["kind"], string> = { fire: "#ff8a1f", police: "#f7f8f8", hospital: "#5b91f5" };

export function driveText(s: NearbySiteDto): string {
  return `${s.estimated ? "about " : ""}${s.minutes} min · ${s.miles} mi`;
}

// The closest help to the house and how long the drive is.
export function NearbyList({ sites }: { sites: NearbySiteDto[] }) {
  if (sites.length === 0) return null;
  return (
    <div>
      <ul className="divide-y divide-line">
        {sites.map((s) => (
          <li key={s.kind} className="flex items-center gap-3 py-2.5">
            <span className="tile">{s.kind === "fire" ? <IconFlame className="h-5 w-5" /> : s.kind === "police" ? <IconShield className="h-5 w-5" /> : <IconHospital className="h-5 w-5" />}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium">{s.name}</span>
              <span className="block text-[13px] text-muted">
                {SITE_LABEL[s.kind]} · {s.city}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-[15px] font-semibold tabular-nums">{s.minutes} min</span>
              <span className="block text-[12px] tabular-nums text-muted">{s.miles} mi</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="pb-1 pt-2 text-[12px] leading-snug text-muted">
        Drive time on clear roads{sites.some((s) => s.estimated) ? ", roughly estimated" : ""}. In a storm it will be longer, and it is not an emergency response time.
      </p>
    </div>
  );
}
