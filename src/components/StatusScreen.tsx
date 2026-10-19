// AI-assisted: written with Claude Code from the team's build spec.
"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAppClock, useHeartbeat, usePendingCount, usePoll } from "@/lib/client/hooks";
import type { StatusDto } from "@/lib/client/types";
import { HouseholdView } from "./HouseholdView";
import { IconClose } from "./icons";
import { PhoneStage } from "./Phone";
import { rememberHousehold } from "./RecentHousehold";
import { TopBar } from "./TopBar";

// Pinned to the corner of the window, outside the phone frame on a computer.
// Esc does the same.
export function ExitFullScreen({ href }: { href: string }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.push(href);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [href, router]);
  return (
    <Link
      href={href}
      className="fixed left-3 top-3 z-[60] flex h-10 items-center gap-2 rounded-full border border-line bg-surface/95 pl-3 pr-4 text-[14px] font-semibold shadow-lg backdrop-blur hover:bg-surface-2 sm:left-5 sm:top-5"
    >
      <IconClose className="h-4 w-4" />
      Exit full screen
      <kbd className="ml-1 hidden rounded border border-line px-1.5 text-[11px] font-medium text-muted sm:inline">Esc</kbd>
    </Link>
  );
}

export function StatusScreen({ id }: { id: string }) {
  const { data, error, stale, reload, fetchedAt } = usePoll<StatusDto>(`/api/households/${id}/status`, 2000);
  const nowMs = useAppClock(data?.clock, fetchedAt);
  const pending = usePendingCount();

  // Only the phone that stays at the household should send heartbeats. A
  // relative checking from another town must not make the house look "alive".
  const [isHousePhone, setIsHousePhone] = useState(false);
  const [housePhoneToken, setHousePhoneToken] = useState<string | null>(null);
  const [pairError, setPairError] = useState<string | null>(null);
  // Pairing issues this phone a secret the server checks on every heartbeat (src/lib/housePhone.ts).
  async function pairHousePhone(on: boolean) {
    setPairError(null);
    try {
      if (on) {
        const res = await fetch(`/api/households/${id}/house-phone`, { method: "POST" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.token) throw new Error(json.error ?? "Could not pair this phone.");
        localStorage.setItem(`pl:hbt:${id}`, json.token);
        setHousePhoneToken(json.token);
      } else {
        await fetch(`/api/households/${id}/house-phone`, { method: "DELETE" }).catch(() => {});
        localStorage.removeItem(`pl:hbt:${id}`);
        setHousePhoneToken(null);
      }
      localStorage.setItem(`pl:hb:${id}`, on ? "1" : "0");
      setIsHousePhone(on);
    } catch (err) {
      setPairError(err instanceof Error ? err.message : "Could not pair this phone.");
    }
  }
  useEffect(() => {
    try {
      const on = localStorage.getItem(`pl:hb:${id}`) === "1";
      const token = localStorage.getItem(`pl:hbt:${id}`);
      setIsHousePhone(on);
      setHousePhoneToken(token);
      // A house phone from before pairing existed: pair it now.
      if (on && !token) pairHousePhone(true);
    } catch {
      // storage blocked
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const beat = useHeartbeat(id, isHousePhone, housePhoneToken);

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
              onChange={(e) => pairHousePhone(e.target.checked)}
            />
          </label>
          {pairError && <p className="mt-3 text-[14px] text-danger">{pairError}</p>}
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
