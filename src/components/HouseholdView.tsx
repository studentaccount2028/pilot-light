// AI-assisted: written with Claude Code from the team's build spec.
"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { ContactDto, NearbySiteDto, StatusDto } from "@/lib/client/types";
import { UTILITIES } from "@/lib/utilities";
import { ContactLadder } from "./ContactLadder";
import { DeviceList } from "./DeviceList";
import { EventLog } from "./EventLog";
import { HouseholdMap } from "./HouseholdMap";
import { IconBolt, IconChevron, IconClock, IconGear, IconHome, IconHouse, IconMessage, IconMore, IconPeople, IconPhone, IconPin, IconPlay } from "./icons";
import { AccountRow } from "./AccountRow";
import { NearbyList } from "./NearbyList";
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
  const sum = summarize(data, nowMs);
  const utility = UTILITIES[data.household.utility];
  const h = data.household;

  const sent = data.alerts.filter((a) => a.sid && a.threshold !== "all_clear");
  const reached = new Set(sent.map((a) => a.contactId)).size;
  const replied = new Set(data.alerts.filter((a) => a.ackAt).map((a) => a.contactId)).size;
  const peopleLine = reached === 0 ? `${data.contacts.length} ${data.contacts.length === 1 ? "person" : "people"} on the list` : `${reached} of ${data.contacts.length} alerted${replied ? ` · ${replied} replied` : ""}`;
  const badge = sum.counting && reached > replied;

  // The person to show on Home: whoever was alerted most recently, else the first on the list.
  const latest = sent.slice().sort((x, y) => (y.sentAt ?? "").localeCompare(x.sentAt ?? ""))[0];
  const lead = data.contacts.find((c) => c.id === latest?.contactId) ?? data.contacts[0];
  const leadAlerts = lead ? data.alerts.filter((a) => a.contactId === lead.id) : [];
  const leadAck = leadAlerts.find((a) => a.ackAt);
  const leadSent = leadAlerts.some((a) => a.sid);
  const leadLine = leadAck ? `Replied ${leadAck.ackBody}` : latest && lead && latest.contactId === lead.id ? (latest.channel === "sms" ? "Texted" : "Called") : "Not contacted";

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
              <div className={framed ? "h-[340px]" : "h-[46dvh] min-h-[320px] sm:h-[340px]"}>
                <HouseholdMap center={{ lat: h.lat, lng: h.lng }} town={h.town} points={[{ lat: h.lat, lng: h.lng, label: h.label, color: TONE_COLOR[sum.tone] }]} sites={nearby} />
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
              {sum.counting && (
                <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-3" role="presentation">
                  <div className={`h-full rounded-full ${sum.fraction < 0.5 ? "bg-danger" : "bg-ink"}`} style={{ width: `${sum.fraction * 100}%`, transition: "width 0.3s linear" }} />
                </div>
              )}
              <p className="mt-3 flex flex-wrap gap-2">
                <TierChip tier={data.risk.tier} />
                <span className="chip">{sum.lastHeard}</span>
                <span className="chip">{sum.weather}</span>
              </p>
              {data.outageRisk && !sum.counting && (
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

            {lead && (
              <section className="mx-3 rounded-xl border border-line bg-surface p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-surface-2 text-[15px] font-semibold">{initials(lead.name)}</div>
                    <p className="mt-2 truncate text-[13px] font-medium text-ink-2">{lead.name}</p>
                  </div>
                  <div className="min-w-0 text-right">
                    <p className={`text-[18px] font-semibold leading-tight tracking-[-0.02em] ${leadSent ? "" : "text-muted"}`}>{leadLine}</p>
                    <p className="mt-0.5 text-[13px] text-muted">{peopleLine}</p>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <a href={`sms:${lead.phone}`} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-line bg-surface-2 text-[14px] font-medium">
                    <IconMessage className="h-5 w-5" />
                    Send a message
                  </a>
                  <a href={`tel:${lead.phone}`} className="flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-surface-2" aria-label={`Call ${lead.name}`}>
                    <IconPhone className="h-5 w-5" />
                  </a>
                  <button onClick={() => go("people")} className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg border border-line bg-surface-2" aria-label="Everyone who gets contacted">
                    <IconMore className="h-5 w-5" />
                  </button>
                </div>
              </section>
            )}

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
            <p className="mt-1 text-[13px] leading-snug text-muted">They reply OK or HELP by text, or press 1 or 2 on a call.</p>
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

const initials = (name: string) =>
  name
    .replace(/\(.*?\)/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";

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
