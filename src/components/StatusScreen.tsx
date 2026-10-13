// AI-assisted: written with Claude Code from the team's build spec.
"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAppClock, useHeartbeat, usePendingCount, usePoll } from "@/lib/client/hooks";
import type { StatusDto } from "@/lib/client/types";
import { HouseholdView } from "./HouseholdView";
import { PhoneStage } from "./Phone";
import { rememberHousehold } from "./RecentHousehold";
import { TopBar } from "./TopBar";

export function StatusScreen({ id }: { id: string }) {
  const { data, error, stale, reload, fetchedAt } = usePoll<StatusDto>(`/api/households/${id}/status`, 2000);
  const nowMs = useAppClock(data?.clock, fetchedAt);
  const pending = usePendingCount();

  // Only the phone that stays at the household should send heartbeats. A
  // relative checking from another town must not make the house look "alive".
  const [isHousePhone, setIsHousePhone] = useState(false);
  useEffect(() => {
    try {
      setIsHousePhone(localStorage.getItem(`pl:hb:${id}`) === "1");
    } catch {
      // storage blocked
    }
  }, [id]);
  const beat = useHeartbeat(id, isHousePhone);

  useEffect(() => {
    if (data) rememberHousehold(data.household.id, data.household.label);
  }, [data]);

  if (error && !data) {
    return (
      <PhoneStage>
        <TopBar />
        <main className="mx-auto max-w-[440px] px-5 pt-10">
          <h1 className="font-display text-[30px] font-semibold leading-tight tracking-tight">We could not open this household</h1>
          <p className="mt-3 text-[16px] text-ink-2">{error} Check the link, or set the household up again.</p>
          <Link href="/h/new" className="btn btn-primary mt-6 h-12 w-full">
            Set up a household
          </Link>
        </main>
      </PhoneStage>
    );
  }
  if (!data || nowMs == null) {
    return (
      <PhoneStage>
        <div className="space-y-2">
          <div className="h-[210px] animate-pulse bg-surface" />
          <div className="h-12 animate-pulse bg-surface" />
          <div className="h-32 animate-pulse bg-surface" />
          <div className="h-40 animate-pulse bg-surface" />
        </div>
      </PhoneStage>
    );
  }

  const replayHere = data.clock.replayActive && data.clock.replayHouseholdId === id;
  const banner = stale
    ? "Offline · showing the last update"
    : replayHere
      ? `Storm replay · ${data.clock.multiplier}x · simulated`
      : pending > 0
        ? `${pending} ${pending === 1 ? "change" : "changes"} waiting to send`
        : null;

  return (
    <PhoneStage>
    <HouseholdView
      data={data}
      nowMs={nowMs}
      banner={banner}
      onChanged={reload}
      housePhone={
        <section className="rounded-2xl bg-surface-2 p-4">
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <span>
              <span className="block text-[16px] font-semibold">This phone stays at the house</span>
              <span className="mt-0.5 block text-[14px] leading-snug text-muted">Turn on only on a phone that lives at {data.household.label}. It checks in every 5 minutes while this page is open.</span>
            </span>
            <input
              type="checkbox"
              className="switch"
              checked={isHousePhone}
              onChange={(e) => {
                setIsHousePhone(e.target.checked);
                try {
                  localStorage.setItem(`pl:hb:${id}`, e.target.checked ? "1" : "0");
                } catch {
                  // storage blocked: the setting lasts until this page closes
                }
              }}
            />
          </label>
          {isHousePhone && (
            <p className="mt-3 flex items-center gap-2 text-[14px] font-semibold text-ok">
              <span className="h-2 w-2 animate-breathe rounded-full bg-ok" />
              {replayHere
                ? "Check-ins are paused while the storm replay runs."
                : beat === "queued"
                  ? "Check-in saved on this phone. It will send when back online."
                  : beat === "sent"
                    ? "Checking in from this phone."
                    : "Starting check-ins…"}
            </p>
          )}
        </section>
      }
    />
    </PhoneStage>
  );
}
