// AI-assisted: written with Claude Code from the team's build spec.
"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Channel, ContactDto, DeviceDto, HouseholdDto } from "@/lib/client/types";
import { DEVICE_PRESETS, presetByKey } from "@/lib/devices";
import { normalizePhone } from "@/lib/phone";
import { UTILITIES, utilityForTown } from "@/lib/utilities";
import { PhoneStage, scrollAppToTop } from "./Phone";
import { TopBar } from "./TopBar";

interface DeviceRow {
  key: number;
  id?: string;
  preset: string;
  label: string;
  backupHours: string;
}
interface ContactRow {
  key: number;
  id?: string;
  name: string;
  phone: string;
  channel: Channel;
  isTownVolunteer: boolean;
  test?: string;
}
interface Place {
  lat: number;
  lng: number;
  zone: string;
  zoneName: string | null;
  forAddress: string;
}

const STEPS = [
  { title: "Where is the house?", blurb: "The address decides which storm warnings apply." },
  { title: "Who lives there?", blurb: "These answers set the risk score: how fast and how widely people are alerted. Skip any you don't know." },
  { title: "What needs power?", blurb: "The device with the least backup sets the clock." },
  { title: "Who should be told?", blurb: "Up to four people, in the order they are contacted." },
  { title: "Share with the town?", blurb: "Optional. You can change this at any time." },
];
const LAST = STEPS.length - 1;
const STEP_NAMES = ["House", "Person", "Devices", "People", "Town"];

type YesNo = boolean | null;

function YesNoField({ label, hint, value, onChange }: { label: string; hint?: string; value: YesNo; onChange: (v: YesNo) => void }) {
  const options: { v: YesNo; text: string }[] = [
    { v: true, text: "Yes" },
    { v: false, text: "No" },
    { v: null, text: "Not sure" },
  ];
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div className="grid grid-cols-3 gap-1 rounded-lg border border-line bg-surface-2 p-1">
        {options.map((o) => (
          <button
            key={o.text}
            type="button"
            aria-pressed={value === o.v}
            onClick={() => onChange(o.v)}
            className={`h-10 cursor-pointer rounded-md text-[14px] font-medium transition-colors ${value === o.v ? "bg-[#e6e6e6] text-[#08090a]" : "text-muted hover:text-ink"}`}
          >
            {o.text}
          </button>
        ))}
      </div>
      {hint && <p className="hint">{hint}</p>}
    </fieldset>
  );
}

let nextKey = 1;
const newDevice = (preset = "o2_portable"): DeviceRow => {
  const p = presetByKey(preset)!;
  return { key: nextKey++, preset, label: p.label, backupHours: p.backupHours == null ? "" : String(p.backupHours) };
};
const newContact = (): ContactRow => ({ key: nextKey++, name: "", phone: "", channel: "sms", isTownVolunteer: false });

export function HouseholdForm({ id }: { id?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(Boolean(id));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  const [town, setTown] = useState("");
  const [place, setPlace] = useState<Place | null>(null);
  const [utility, setUtility] = useState<HouseholdDto["utility"] | "">("");
  const [utilityGuess, setUtilityGuess] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [share, setShare] = useState(false);
  const [residentName, setResidentName] = useState("");
  const [residentAge, setResidentAge] = useState("");
  const [residentPhone, setResidentPhone] = useState("");
  const [residentChannel, setResidentChannel] = useState<"voice" | "sms">("voice");
  const [livesAlone, setLivesAlone] = useState<YesNo>(null);
  const [canLeave, setCanLeave] = useState<YesNo>(null);
  const [canReach, setCanReach] = useState<YesNo>(null);
  const [devices, setDevices] = useState<DeviceRow[]>(() => [newDevice()]);
  const [contacts, setContacts] = useState<ContactRow[]>(() => [newContact()]);
  const [lookup, setLookup] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [step, setStep] = useState(0);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await fetch(`/api/households/${id}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Could not load the household.");
        const h = json.household as HouseholdDto;
        setLabel(h.label);
        setAddress(h.address);
        setTown(h.town);
        setPlace({ lat: h.lat, lng: h.lng, zone: h.nwsZone, zoneName: h.zoneName, forAddress: h.address });
        setUtility(h.utility);
        setRegistered(h.registeredWithUtility);
        setShare(h.shareWithTown);
        setResidentName(h.residentName ?? "");
        setResidentAge(h.residentAge == null ? "" : String(h.residentAge));
        setResidentPhone(h.residentPhone ?? "");
        setResidentChannel(h.residentChannel === "sms" ? "sms" : "voice");
        setLivesAlone(h.livesAlone);
        setCanLeave(h.canLeaveUnassisted);
        setCanReach(h.canReachBackup);
        setDevices(
          (json.devices as DeviceDto[]).map((d) => ({
            key: nextKey++,
            id: d.id,
            // Same label if possible, else the same type with or without a battery to match.
            preset: (
              DEVICE_PRESETS.find((p) => p.label === d.label) ??
              DEVICE_PRESETS.find((p) => p.type === d.type && (p.backupHours == null) === (d.backupHours == null)) ??
              DEVICE_PRESETS.find((p) => p.type === d.type) ??
              DEVICE_PRESETS[0]
            ).key,
            label: d.label,
            backupHours: d.backupHours == null ? "" : String(d.backupHours),
          })),
        );
        setContacts((json.contacts as ContactDto[]).map((c) => ({ key: nextKey++, id: c.id, name: c.name, phone: c.phone, channel: c.channel, isTownVolunteer: c.isTownVolunteer })));
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Could not load the household.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const placeIsCurrent = place != null && place.forAddress === address.trim();

  function applyTown(next: string) {
    setTown(next);
    const guess = utilityForTown(next);
    if (guess && (utility === "" || utilityGuess)) {
      setUtility(guess.utility);
      setUtilityGuess(true);
    }
  }

  async function findAddress() {
    setLookup({ busy: true, error: null });
    try {
      const res = await fetch(`/api/resolve?address=${encodeURIComponent(address.trim())}&town=${encodeURIComponent(town.trim())}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not look that address up.");
      setPlace({ lat: json.lat, lng: json.lng, zone: json.zone, zoneName: json.zoneName, forAddress: address.trim() });
      if (json.town) applyTown(json.town);
      setLookup({ busy: false, error: json.approximate ? "We could not find that street, so the town centre is used. Storm warnings will still be right for the town." : null });
    } catch (err) {
      setLookup({ busy: false, error: err instanceof Error ? err.message : "Could not look that address up." });
    }
  }

  const patchDevice = (key: number, patch: Partial<DeviceRow>) => setDevices((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const patchContact = (key: number, patch: Partial<ContactRow>) => setContacts((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const moveContact = (index: number, by: number) =>
    setContacts((rows) => {
      const next = rows.slice();
      const [row] = next.splice(index, 1);
      next.splice(index + by, 0, row);
      return next;
    });

  async function sendTest(c: ContactRow) {
    patchContact(c.key, { test: "Sending…" });
    try {
      const res = await fetch("/api/contacts/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: c.phone, channel: c.channel === "voice" ? "voice" : "sms" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not send.");
      patchContact(c.key, {
        test: json.simulated ? "Simulated only: Twilio keys are not set, so nothing was sent." : json.channel === "voice" ? "Calling now. Ask them if the phone rang." : "Text sent. Ask them if it arrived.",
      });
    } catch (err) {
      patchContact(c.key, { test: err instanceof Error ? err.message : "Could not send." });
    }
  }

  // Each step checks only its own fields, so a mistake is caught on the screen it was made.
  const stepProblems: string[][] = [[], [], [], [], []];
  if (!label.trim()) stepProblems[0].push("Give the household a name.");
  if (!address.trim()) stepProblems[0].push("Enter the address.");
  if (!town.trim()) stepProblems[0].push("Enter the town.");
  if (!utility) stepProblems[0].push("Choose the electric utility.");
  const residentPhoneBad = residentPhone.trim() !== "" && !normalizePhone(residentPhone);
  const residentAgeBad = residentAge !== "" && !(Number.isInteger(Number(residentAge)) && Number(residentAge) >= 18 && Number(residentAge) <= 120);
  if (residentAgeBad) stepProblems[1].push("Age must be a whole number between 18 and 120.");
  if (residentPhoneBad) stepProblems[1].push("Fix their phone number, or leave it blank.");
  if (devices.some((d) => !d.label.trim())) stepProblems[2].push("Name every device.");
  if (devices.some((d) => d.backupHours !== "" && !(Number(d.backupHours) >= 0 && Number(d.backupHours) <= 720))) stepProblems[2].push("Backup hours must be between 0 and 720.");
  if (contacts.some((c) => !c.name.trim())) stepProblems[3].push("Name every contact.");
  if (contacts.some((c) => !normalizePhone(c.phone))) stepProblems[3].push("Fix the phone number marked below.");
  const firstBadStep = stepProblems.findIndex((p) => p.length > 0);

  function goTo(next: number) {
    setError(null);
    // Moving forward past a step with a mistake stops on that step.
    const blocker = stepProblems.slice(0, next).findIndex((p) => p.length > 0);
    if (blocker >= 0) {
      setShowErrors(true);
      setStep(blocker);
      setError(stepProblems[blocker][0]);
      scrollAppToTop();
      return;
    }
    // A fresh step starts clean; its fields are only marked after a failed Next.
    setShowErrors(false);
    setStep(next);
    scrollAppToTop();
  }


  async function save(e: React.FormEvent) {
    e.preventDefault();
    setShowErrors(true);
    setError(null);
    // Enter on an early step means "next", not "save".
    if (!id && step < LAST) {
      goTo(step + 1);
      return;
    }
    if (firstBadStep >= 0) {
      scrollAppToTop();
      setStep(firstBadStep);
      setError(stepProblems[firstBadStep][0]);
      return;
    }
    setSaving(true);
    try {
      const body = {
        label,
        address,
        town,
        // If the address changed since the last lookup, the server looks it up again.
        lat: placeIsCurrent ? place.lat : null,
        lng: placeIsCurrent ? place.lng : null,
        utility,
        registeredWithUtility: registered,
        shareWithTown: share,
        residentName,
        residentAge: residentAge === "" ? null : Number(residentAge),
        residentPhone,
        residentChannel,
        livesAlone,
        canLeaveUnassisted: canLeave,
        canReachBackup: canReach,
        devices: devices.map((d) => ({ id: d.id, type: presetByKey(d.preset)!.type, label: d.label, backupHours: d.backupHours === "" ? null : Number(d.backupHours) })),
        contacts: contacts.map((c) => ({ id: c.id, name: c.name, phone: c.phone, channel: c.channel, isTownVolunteer: c.isTownVolunteer })),
      };
      const res = await fetch(id ? `/api/households/${id}` : "/api/households", {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.push(`/login?next=${encodeURIComponent(id ? `/h/${id}/edit` : "/h/new")}`);
        return;
      }
      if (!res.ok) throw new Error(json.error ?? "Could not save. Please try again.");
      router.push(`/h/${json.id}`);
    } catch (err) {
      setError(err instanceof TypeError ? "This phone is offline. Your entries are still on this page; try Save again when you have a connection." : err instanceof Error ? err.message : "Could not save.");
      setSaving(false);
          }
  }

  if (loading) return (
    <>
      <TopBar />
      <div className="mx-auto mt-8 h-96 max-w-[400px] animate-pulse rounded-2xl bg-surface-2" />
    </>
  );
  if (loadError) {
    return (
      <div className="mx-auto max-w-[440px] space-y-4 px-5 pt-10">
        <h1 className="font-display text-[30px] font-semibold tracking-tight">We could not open this household</h1>
        <p className="text-ink-2">{loadError}</p>
        <Link href="/h/new" className="btn btn-primary">
          Set up a household
        </Link>
      </div>
    );
  }

  const utilityInfo = utility ? UTILITIES[utility] : null;

  return (
    <PhoneStage>
    <TopBar />
    <form onSubmit={save} className="mx-auto max-w-[440px] space-y-7 px-5 pb-32 pt-6" noValidate>
      <div>
        <div className="flex gap-1.5" role="tablist" aria-label="Setup steps">
          {STEPS.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === step}
              aria-label={`Step ${i + 1}: ${STEP_NAMES[i]}`}
              onClick={() => goTo(i)}
              className="group flex-1 cursor-pointer py-2"
            >
              <span className={`block h-1 rounded-full transition-colors ${i <= step ? "bg-ink" : "bg-surface-3 group-hover:bg-muted"}`} />
              <span className={`mt-2 block text-left text-[12px] font-semibold ${i === step ? "text-ink" : "text-muted"}`}>{STEP_NAMES[i]}</span>
            </button>
          ))}
        </div>
        <h1 className="title-xl mt-6">{STEPS[step].title}</h1>
        <p className="mt-2 text-[16px] leading-snug text-muted">{STEPS[step].blurb}</p>
      </div>

      <p ref={errorRef} className={error ? "rounded-xl bg-danger/10 px-4 py-3 font-semibold text-danger" : "hidden"} role="alert">
        {error}
      </p>

      {step === 0 && (
      <section className="space-y-4">
        <label className="block">
          <span className="label">Name for this household</span>
          <input className="field" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Mom's house" maxLength={80} />
        </label>
        <div>
          <label className="block">
            <span className="label">Street address and town</span>
            <input className="field" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="12 Maple Road, Ossipee, NH" autoComplete="street-address" maxLength={300} />
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" className="btn" onClick={findAddress} disabled={lookup.busy || address.trim().length < 5}>
              {lookup.busy ? "Looking up…" : "Find weather zone"}
            </button>
            {placeIsCurrent && (
              <span className="rounded-full bg-ok/15 px-3.5 py-2 text-[13px] font-semibold text-ok">
                Zone {place.zone}
                {place.zoneName ? ` · ${place.zoneName}` : ""}
              </span>
            )}
          </div>
          {lookup.error && <p className="mt-2 text-sm font-semibold text-danger">{lookup.error}</p>}
          <p className="hint">The weather zone decides which storm warnings apply. If you skip the lookup, it is done when you save.</p>
        </div>
        <label className="block">
          <span className="label">Town</span>
          <input className="field" value={town} onChange={(e) => applyTown(e.target.value)} placeholder="Ossipee" maxLength={80} />
        </label>
        <div>
          <label className="block">
            <span className="label">Electric utility</span>
            <select
              className="field"
              value={utility}
              onChange={(e) => {
                setUtility(e.target.value as HouseholdDto["utility"]);
                setUtilityGuess(false);
              }}
            >
              <option value="">Choose…</option>
              {Object.entries(UTILITIES).map(([key, u]) => (
                <option key={key} value={key}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          {utilityGuess && <p className="hint">Our best guess for {town}. Some towns have two utilities, so check the name on the electric bill.</p>}
          {utilityInfo && (
            <div className="mt-3 rounded-2xl bg-surface-2 p-4">
              <p className="text-sm text-ink-2">{utilityInfo.lifeSupportNote}</p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm link">
                {utilityInfo.lifeSupportUrl && (
                  <a href={utilityInfo.lifeSupportUrl} target="_blank" rel="noreferrer">
                    Medical registration page
                  </a>
                )}
                {utilityInfo.lifeSupportPhone && <a href={`tel:${utilityInfo.lifeSupportPhone.replace(/[^0-9+]/g, "")}`}>Call {utilityInfo.lifeSupportPhone}</a>}
              </div>
              <label className="mt-3 flex min-h-12 cursor-pointer items-center gap-3">
                <input type="checkbox" className="check" checked={registered} onChange={(e) => setRegistered(e.target.checked)} />
                <span className="font-semibold">This household is registered with the utility</span>
              </label>
            </div>
          )}
        </div>
      </section>
      )}

      {step === 1 && (
      <section className="space-y-4">
        <div className="grid grid-cols-[1fr_96px] gap-3">
          <label className="block">
            <span className="label">What you call them</span>
            <input className="field" value={residentName} onChange={(e) => setResidentName(e.target.value)} placeholder="Mom" maxLength={60} autoComplete="off" />
          </label>
          <label className="block">
            <span className="label">Age</span>
            <input className={`field ${residentAgeBad ? "border-danger" : ""}`} type="number" inputMode="numeric" min={18} max={120} value={residentAge} onChange={(e) => setResidentAge(e.target.value)} placeholder="82" />
          </label>
        </div>
        <YesNoField label="Do they live alone?" value={livesAlone} onChange={setLivesAlone} />
        <YesNoField label="Can they leave the house without help?" hint="For example, walk to a neighbor or get to a car." value={canLeave} onChange={setCanLeave} />
        <YesNoField label="Do they know where the backup is, and can they get to it?" hint="A battery pack, spare oxygen tank or generator they can reach and switch on themselves." value={canReach} onChange={setCanReach} />
        <div className="rounded-xl border border-line p-4">
          <label className="block">
            <span className="label">Their phone number (optional)</span>
            <input className={`field ${residentPhoneBad ? "border-danger" : ""}`} type="tel" inputMode="tel" value={residentPhone} onChange={(e) => setResidentPhone(e.target.value)} placeholder="603 555 0123" autoComplete="off" />
            {residentPhoneBad && <span className="mt-1 block text-[13px] font-medium text-danger">Enter the full number with area code, for example 603 555 0123.</span>}
          </label>
          <label className="mt-3 block">
            <span className="label">How to reach them</span>
            <select className="field" value={residentChannel} onChange={(e) => setResidentChannel(e.target.value as "voice" | "sms")}>
              <option value="voice">Phone call (landline or cell)</option>
              <option value="sms">Text message</option>
            </select>
          </label>
          <p className="hint">
            When a storm warning starts, Pilot Light asks them once: is your backup charged, plugged in and within reach? Their answer goes into the risk score and
            into the alert your contacts receive.
          </p>
        </div>
      </section>
      )}

      {step === 2 && (
      <section className="space-y-4">
        <p className="hint !mt-0">Only the kind of device and its hours are stored, never medical records.</p>
        {devices.map((d, i) => (
          <fieldset key={d.key} className="space-y-3 rounded-2xl border border-line p-4">
            <legend className="px-1.5 text-[13px] font-semibold text-muted">Device {i + 1}</legend>
            <label className="block">
              <span className="label">Kind</span>
              <select
                className="field"
                value={d.preset}
                onChange={(e) => {
                  const p = presetByKey(e.target.value)!;
                  patchDevice(d.key, { preset: p.key, label: p.label, backupHours: p.backupHours == null ? "" : String(p.backupHours) });
                }}
              >
                {DEVICE_PRESETS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Name shown in alerts</span>
              <input className="field" value={d.label} onChange={(e) => patchDevice(d.key, { label: e.target.value })} maxLength={80} />
            </label>
            <label className="block">
              <span className="label">Hours it runs without power (leave blank for none)</span>
              <input className="field" type="number" inputMode="decimal" min={0} max={720} step="0.5" value={d.backupHours} onChange={(e) => patchDevice(d.key, { backupHours: e.target.value })} placeholder="None" />
              <span className="hint block">{presetByKey(d.preset)?.help}</span>
            </label>
            {devices.length > 1 && (
              <button type="button" className="text-sm font-semibold text-danger underline underline-offset-2" onClick={() => setDevices((rows) => rows.filter((r) => r.key !== d.key))}>
                Remove this device
              </button>
            )}
          </fieldset>
        ))}
        <button type="button" className="btn" onClick={() => setDevices((rows) => [...rows, newDevice("cpap_battery")])} disabled={devices.length >= 12}>
          Add another device
        </button>
      </section>
      )}

      {step === 3 && (
      <section className="space-y-4">
        <p className="hint !mt-0">The first is contacted at 6 hours left, the first two at 2 hours, everyone at zero. Choose Call for a landline.</p>
        {contacts.map((c, i) => {
          const phoneBad = c.phone.trim() !== "" && !normalizePhone(c.phone);
          const phoneMissing = showErrors && c.phone.trim() === "";
          return (
            <fieldset key={c.key} className="space-y-3 rounded-2xl border border-line p-4">
              <legend className="px-1.5 text-[13px] font-semibold text-muted">Contact {i + 1}</legend>
              <label className="block">
                <span className="label">Name</span>
                <input className="field" value={c.name} onChange={(e) => patchContact(c.key, { name: e.target.value })} placeholder="Dana (daughter)" maxLength={80} autoComplete="off" />
              </label>
              <label className="block">
                <span className="label">Phone number</span>
                <input className={`field ${phoneBad || phoneMissing ? "border-danger" : ""}`} type="tel" inputMode="tel" value={c.phone} onChange={(e) => patchContact(c.key, { phone: e.target.value, test: undefined })} placeholder="603 555 0123" autoComplete="off" />
                {(phoneBad || phoneMissing) && <span className="mt-1 block text-sm font-semibold text-danger">Enter the full number with area code, for example 603 555 0123.</span>}
              </label>
              <label className="block">
                <span className="label">How to reach them</span>
                <select className="field" value={c.channel} onChange={(e) => patchContact(c.key, { channel: e.target.value as Channel })}>
                  <option value="sms">Text message</option>
                  <option value="voice">Phone call (landline)</option>
                  <option value="both">Text and phone call</option>
                </select>
              </label>
              <label className="flex min-h-12 cursor-pointer items-center gap-3">
                <input type="checkbox" className="check" checked={c.isTownVolunteer} onChange={(e) => patchContact(c.key, { isTownVolunteer: e.target.checked })} />
                <span>
                  <span className="font-semibold">This is a town volunteer</span>
                  <span className="hint block">Only contacted at zero hours, and only if you share with the town below.</span>
                </span>
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="btn" onClick={() => sendTest(c)} disabled={!normalizePhone(c.phone)}>
                  {c.channel === "voice" ? "Place test call" : "Send test text"}
                </button>
                <button type="button" className="btn" onClick={() => moveContact(i, -1)} disabled={i === 0} aria-label={`Move contact ${i + 1} up`}>
                  Move up
                </button>
                <button type="button" className="btn" onClick={() => moveContact(i, 1)} disabled={i === contacts.length - 1} aria-label={`Move contact ${i + 1} down`}>
                  Move down
                </button>
                {contacts.length > 1 && (
                  <button type="button" className="text-sm font-semibold text-danger underline underline-offset-2" onClick={() => setContacts((rows) => rows.filter((r) => r.key !== c.key))}>
                    Remove
                  </button>
                )}
              </div>
              {c.test && <p className="text-sm text-ink-2">{c.test}</p>}
            </fieldset>
          );
        })}
        <button type="button" className="btn" onClick={() => setContacts((rows) => [...rows, newContact()])} disabled={contacts.length >= 4}>
          Add another contact
        </button>
      </section>
      )}

      {step === 4 && (
      <section className="rounded-2xl bg-surface-2 p-4">
        <label className="flex min-h-12 cursor-pointer items-start gap-3">
          <input type="checkbox" className="mt-1 check" checked={share} onChange={(e) => setShare(e.target.checked)} />
          <span>
            <span className="font-semibold">Share with the {town.trim() || "town"} volunteer roster</span>
            <span className="hint block">
              The town&apos;s volunteer coordinator can then see this household&apos;s address, device and hours remaining during an outage, and a town volunteer is
              texted at zero hours. You can switch this off at any time.
            </span>
          </span>
        </label>
      </section>
      )}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/90 px-5 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 sm:pb-6">
        <div className="mx-auto flex max-w-[400px] gap-3">
          {step > 0 ? (
            <button type="button" className="btn h-12" onClick={() => goTo(step - 1)}>
              Back
            </button>
          ) : id ? (
            <Link href={`/h/${id}`} className="btn h-12">
              Cancel
            </Link>
          ) : null}
          {id && step < LAST && (
            <button type="button" className="btn h-12" onClick={() => goTo(step + 1)}>
              Next
            </button>
          )}
          <button className="btn btn-primary h-12 flex-1 text-[17px]" disabled={saving}>
            {saving ? "Saving…" : id || step === LAST ? "Save household" : "Next"}
          </button>
        </div>
      </div>
    </form>
    </PhoneStage>
  );
}
