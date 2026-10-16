// AI-assisted: written with Claude Code from the team's build spec.
"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { leadResponder, minutesAway, respondersFor } from "@/lib/client/responders";
import type { ContactDto, NearbySiteDto, RouteDto, StatusDto } from "@/lib/client/types";
import { UTILITIES } from "@/lib/utilities";
import { ContactLadder } from "./ContactLadder";
import { DeviceList } from "./DeviceList";
import { EventLog } from "./EventLog";
import { HouseholdMap, type MapPerson } from "./HouseholdMap";
import { IconBolt, IconChevron, IconClock, IconGear, IconHome, IconHouse, IconMore, IconPeople, IconPhone, IconPin, IconPlay } from "./icons";
import { AccountRow } from "./AccountRow";
import { NearbyList } from "./NearbyList";
import { PowerCard, useSensors } from "./PowerCard";
import { SensorSetup } from "./SensorSetup";
import { ResponderCard } from "./ResponderCard";
import { scrollAppToTop } from "./Phone";
import { RiskCard, TierChip } from "./RiskCard";
import { StatusBand, summarize, TONE_COLOR } from "./StatusCard";

const TABS = [
  { key: "home", label: "Home", icon: IconHome },
  { key: "people", label: "People", icon: IconPeople },
  { key: "activity", label: "Activity", icon: IconClock },
  { key: "house", label: "House", icon: IconHouse },
] as const;
type Tab = (typeof TABS)[number]["key"];

// The family's app: four tabs over one household. Used full-screen, and inside
// the phone frame on the replay console.
export function HouseholdView({
  data,
  nowMs,
  framed = false,
  banner,
  housePhone,
  contactActions,
  onChanged,
}: {
  data: StatusDto;
  nowMs: number;
  framed?: boolean;
  banner?: string | null;
  housePhone?: ReactNode;
  contactActions?: (c: ContactDto) => ReactNode;
  onChanged?: () => void;
}) {
  const [tab, setTab] = useState<Tab>("home");
  // The power module(s) at the house, if any are paired.
  const { sensors, reload: reloadSensors } = useSensors(data.household.id);
  // Nearest fire, police and hospital with drive times. Looked up once per house.
  const [nearby, setNearby] = useState<NearbySiteDto[]>([]);
  const householdId = data.household.id;
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/households/${householdId}/nearby`)
      .then((r) => (r.ok ? r.json() : { sites: [] }))
      .then((j) => !cancelled && setNearby(j.sites ?? []))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [householdId]);
  // The road from each contact to the house. Looked up again only when someone moves.
  const [routes, setRoutes] = useState<RouteDto[]>([]);
  const placesKey = data.contacts.map((c) => `${c.id}:${c.lat},${c.lng}`).join("|");
  useEffect(() => {
    let cancelled = false;
    if (!placesKey.match(/:-?\d/)) return;
    fetch(`/api/households/${householdId}/routes`)
      .then((r) => (r.ok ? r.json() : { routes: [] }))
      .then((j) => !cancelled && setRoutes(j.routes ?? []))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [householdId, placesKey]);
  const sum = summarize(data, nowMs);
  const utility = UTILITIES[data.household.utility];
  const h = data.household;

  const sent = data.alerts.filter((a) => a.sid && a.threshold !== "all_clear");
  const reached = new Set(sent.map((a) => a.contactId)).size;
  const replied = new Set(data.alerts.filter((a) => a.ackAt).map((a) => a.contactId)).size;
  // Who is answering, like drivers in a ride app: the one closest to the door leads.
  const responders = respondersFor(data.contacts, data.alerts);
  const lead = leadResponder(responders);
  const onWay = responders.filter((r) => r.stage === "on_way").length;
  const arrived = responders.filter((r) => r.stage === "arrived").length;
  const peopleLine =
    reached === 0
      ? `${data.contacts.length} ${data.contacts.length === 1 ? "person" : "people"} on the list`
      : [`${reached} of ${data.contacts.length} alerted`, replied && `${replied} replied`, onWay && `${onWay} on the way`, arrived && `${arrived} arrived`].filter(Boolean).join(" · ");
  const badge = (sum.counting || sum.helped) && reached > replied;
  const enRoute = lead?.stage === "on_way" ? lead : null;
  const enRouteMin = enRoute ? minutesAway(enRoute.etaAt!, nowMs) : null;

  // Everyone on the list who has a location, on the map. Whoever is on the way
  // rides along their road toward the house as the arrival time nears.
  const people: MapPerson[] = data.contacts.flatMap((c, i) => {
    if (c.lat == null || c.lng == null || !c.active) return [];
    const r = responders.find((x) => x.contact.id === c.id);
    const stage = r?.stage ?? "idle";
    const first = c.name.replace(/\(.*?\)/g, "").trim().split(/\s+/)[0] || c.name;
    const route = routes.find((x) => x.contactId === c.id)?.coords ?? null;
    let progress = 0;
    let label = first;
    if (stage === "on_way" && r?.seenAt && r.etaAt) {
      const start = Date.parse(r.seenAt);
      const end = Date.parse(r.etaAt);
      progress = end > start ? Math.max(0, Math.min(1, (nowMs - start) / (end - start))) : 1;
      const left = minutesAway(r.etaAt, nowMs);
      label = left != null ? `${first} · ${left} min` : `${first} · arriving`;
    } else if (stage === "arrived") label = `${first} · here`;
    else if (stage === "help") label = `${first} · HELP`;
    else if (stage === "seen") label = `${first} · replied`;
    else if (stage === "alerted") label = `${first} · alerted`;
    // Arrived: beside the house, fanned out so two people don't overlap.
    const at = stage === "arrived" ? { lat: h.lat + 0.0012, lng: h.lng + 0.002 * (i - 1) } : { lat: c.lat, lng: c.lng };
    return [{ id: c.id, initials: initialsOf(c.name), name: c.name, ...at, stage, label, route, progress }];
  });

  const go = (t: Tab) => {
    setTab(t);
    scrollAppToTop();
  };

  return (
    <div className={`flex flex-col bg-bg ${framed ? "h-full" : "min-h-dvh sm:min-h-full"}`}>
      <div className={`flex-1 ${framed ? "overflow-y-auto overscroll-contain" : "pb-[calc(env(safe-area-inset-bottom)+76px)] sm:pb-[88px]"}`}>
        {tab === "home" && (
          <div className="space-y-2.5 bg-bg pb-3">
            <div className="overflow-hidden border-b border-line bg-surface">
              <div className={`relative ${framed ? "h-[340px]" : "h-[46dvh] min-h-[320px] sm:h-[340px]"}`}>
                <HouseholdMap center={{ lat: h.lat, lng: h.lng }} town={h.town} points={[{ lat: h.lat, lng: h.lng, label: h.label, color: TONE_COLOR[sum.tone] }]} sites={enRoute ? [] : nearby} people={people} legend={!(enRoute || lead?.stage === "arrived")} />
                {(enRoute || lead?.stage === "arrived") && (
                  <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex items-center gap-2.5 rounded-xl border border-line bg-surface/95 px-3.5 py-2.5 shadow-lg backdrop-blur">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${enRoute ? "animate-breathe bg-ink" : "bg-ok"}`} />
                    <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
                      {enRoute ? `${lead!.contact.name} is on the way` : `${lead!.contact.name} has arrived`}
                    </span>
                    <span className="shrink-0 text-[14px] font-semibold tabular-nums">{enRoute ? (enRouteMin != null ? `${enRouteMin} min` : "Due now") : "Here"}</span>
                  </div>
                )}
              </div>
              <div className="border-t border-line px-4 py-3 text-center">
                <h1 className="text-[17px] font-semibold tracking-[-0.02em]">{sum.headline}</h1>
                {banner && <p className="mt-0.5 text-[12px] font-semibold text-info">{banner}</p>}
              </div>
              <StatusBand summary={sum} onClick={sum.tone === "setup" ? () => go("house") : undefined} />
            </div>

            <section className="mx-3 rounded-xl border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-muted">Details</p>
                  <p className="mt-1 text-[17px] font-semibold leading-snug tracking-[-0.02em]">{sum.statement}</p>
                </div>
                <button onClick={() => go("house")} className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-line bg-surface-2" aria-label="House details">
                  <IconMore className="h-5 w-5" />
                </button>
              </div>
              {sum.timed && (
                <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-3" role="presentation">
                  <div className={`h-full rounded-full ${sum.fraction < 0.5 ? "bg-danger" : "bg-ink"}`} style={{ width: `${sum.fraction * 100}%`, transition: "width 0.3s linear" }} />
                </div>
              )}
              <p className="mt-3 flex flex-wrap gap-2">
                <TierChip tier={data.risk.tier} />
                <span className="chip">{sum.lastHeard}</span>
                <span className="chip">{sum.weather}</span>
              </p>
              {data.outageRisk && !sum.timed && (
                <div className="mt-3 rounded-lg border border-line bg-surface-2 p-3">
                  <p className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] font-medium text-muted">Chance this storm cuts power in the county</span>
                    <span className="text-[20px] font-semibold tabular-nums tracking-[-0.02em]">{data.outageRisk.percent}%</span>
                  </p>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3" role="presentation">
                    <div className="h-full rounded-full bg-ink" style={{ width: `${data.outageRisk.percent}%` }} />
                  </div>
                  <p className="mt-2 text-[12px] leading-snug text-muted">
                    {data.outageRisk.why} Typical for a warning: {data.outageRisk.baseRatePercent}%. Charge the backup now.
                  </p>
                </div>
              )}
              {(sum.out || sum.helped) && (
                <a href="tel:911" className="btn btn-danger mt-4 h-11 w-full text-[15px]">
                  <IconPhone className="h-5 w-5" />
                  Call 911
                </a>
              )}
            </section>

            {sensors?.map((sensor) => (
              <PowerCard key={sensor.id} sensor={sensor} nowMs={nowMs} />
            ))}

            {data.contacts.length > 0 && <ResponderCard responder={lead} fallback={data.contacts[0]} peopleLine={peopleLine} nowMs={nowMs} onMore={() => go("people")} />}

            {nearby.length > 0 && (
              <section className="mx-3 rounded-xl border border-line bg-surface px-4 pb-2 pt-4">
                <h2 className="text-[13px] font-medium text-muted">Nearest help</h2>
                <NearbyList sites={nearby} />
              </section>
            )}

            <section className="mx-3 rounded-xl border border-line bg-surface px-4 pb-1 pt-4">
              <DeviceList data={data} nowMs={nowMs} onChanged={onChanged} />
            </section>
          </div>
        )}

        {tab === "people" && (
          <div className="animate-rise px-4 pt-8">
            <h1 className="title-xl">People</h1>
            <div className="mt-5">
              <RiskCard risk={data.risk} residentName={data.resident.name} nearby={nearby} />
            </div>
            <h2 className="h-section mt-7">Who gets contacted</h2>
            <p className="mt-1 text-[13px] leading-snug text-muted">They reply OK with their minutes away (OK 20), HERE when they arrive, or HELP. On a call, 1 or 2.</p>
            <div className="mt-3">
              <ContactLadder contacts={data.contacts} alerts={data.alerts} actions={contactActions} />
            </div>
            {!framed && (
              <Link href={`/h/${h.id}/edit`} className="btn mt-4 w-full">
                Change who gets contacted
              </Link>
            )}
          </div>
        )}

        {tab === "activity" && (
          <div className="animate-rise px-4 pt-8">
            <h1 className="title-xl">Activity</h1>
            <p className="mt-2 text-[15px] leading-snug text-muted">Every state change, message and reply, newest first.</p>
            <div className="mt-6">
              <EventLog events={data.events} />
            </div>
            <p className="mt-6 text-[13px] text-muted">Messages are {data.transport === "twilio" ? "live through Twilio" : "simulated: no Twilio keys are set"}.</p>
          </div>
        )}

        {tab === "house" && (
          <div className="animate-rise px-4 pt-8">
            <h1 className="title-xl">{h.label}</h1>
            <p className="mt-2 text-[15px] text-muted">{h.address}</p>

            <div className="mt-6">{housePhone}</div>

            {!framed && sensors && (
              <div className="mt-6">
                <SensorSetup householdId={h.id} sensors={sensors} onChanged={reloadSensors} />
              </div>
            )}

            {nearby.length > 0 && (
              <div className="mt-6">
                <h2 className="h-section">Nearest help</h2>
                <NearbyList sites={nearby} />
              </div>
            )}

            <ul className="mt-6 divide-y divide-line border-y border-line">
              <InfoRow icon={<IconPin className="h-5 w-5" />} label="Weather zone" value={`${h.zoneName ?? h.nwsZone} · ${h.nwsZone}`} />
              <InfoRow
                icon={<IconBolt className="h-5 w-5" />}
                label={`${utility.name} · ${h.registeredWithUtility ? "registered" : "not registered"}`}
                value={utility.lifeSupportUrl || utility.lifeSupportPhone ? "Register for medical notice" : "Ask about their medical list"}
                href={utility.lifeSupportUrl ?? (utility.lifeSupportPhone ? `tel:${utility.lifeSupportPhone.replace(/[^0-9+]/g, "")}` : undefined)}
              />
              {utility.outageMapUrl && <InfoRow icon={<IconBolt className="h-5 w-5" />} label="Outages" value={`${utility.name} outage information`} href={utility.outageMapUrl} />}
              {!framed && <InfoRow icon={<IconGear className="h-5 w-5" />} label="Devices, contacts, address" value="Edit household" href={`/h/${h.id}/edit`} internal />}
              {!framed && <InfoRow icon={<IconPlay className="h-4 w-4" />} label="Demo" value="Storm replay" href="/replay" internal />}
              {!framed && <AccountRow />}
            </ul>
            <p className="mt-6 text-[13px] leading-relaxed text-muted">Pilot Light makes sure someone checks. It is not a medical device and it does not replace 911.</p>
          </div>
        )}
      </div>

      <nav className={`z-30 border-t border-line bg-surface ${framed ? "pb-3" : "fixed inset-x-0 bottom-0 pb-[env(safe-area-inset-bottom)] sm:pb-3"}`} aria-label="Sections">
        <div className="grid grid-cols-4">
          {TABS.map((t) => {
            const on = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => go(t.key)}
                aria-current={on ? "page" : undefined}
                className={`relative flex h-[58px] cursor-pointer flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${on ? "text-ink" : "text-muted"}`}
              >
                <t.icon className="h-[22px] w-[22px]" strokeWidth={on ? 2 : 1.5} />
                {t.label}
                {t.key === "people" && badge && <span className="absolute left-1/2 top-2 ml-2.5 h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-bg" />}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function InfoRow({ icon, label, value, href, internal }: { icon: ReactNode; label: string; value: string; href?: string; internal?: boolean }) {
  const body = (
    <>
      <span className="tile">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium leading-snug">{value}</span>
        <span className="block text-[13px] text-muted">{label}</span>
      </span>
      {href && <IconChevron className="h-4 w-4 shrink-0 text-muted" />}
    </>
  );
  return (
    <li>
      {!href ? (
        <div className="row">{body}</div>
      ) : internal ? (
        <Link href={href} className="row">
          {body}
        </Link>
      ) : (
        <a href={href} target={href.startsWith("tel:") ? undefined : "_blank"} rel="noreferrer" className="row">
          {body}
        </a>
      )}
    </li>
  );
}

const initialsOf = (name: string) =>
  name
    .replace(/\(.*?\)/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";
