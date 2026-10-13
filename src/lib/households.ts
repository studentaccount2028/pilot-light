// AI-assisted: written with Claude Code from the team's build spec.
// Saving and reading a household profile. Bad input fails the save with a
// message the form can show; nothing half-saves.
import { and, desc, eq, ilike, inArray, notInArray } from "drizzle-orm";
import { db } from "../db/client";
import {
  alertsSent,
  contacts,
  deviceTypeEnum,
  devices,
  events,
  householdState,
  households,
  nwsAlerts,
  utilityEnum,
  type DeviceType,
  type Utility,
} from "../db/schema";
import { getClock, simNow } from "./clock";
import { ageFromBirthYear, recommendContact, TIER_RANK } from "./engine/risk";
import { limitingDevice } from "./engine/rules";
import { describeDrivers, outageRisk } from "./engine/outageRisk";
import { riskFor } from "./riskFor";
import { locateInNH, resolveZone } from "./nws";
import { normalizePhone, transportMode } from "./twilio";

export class ValidationError extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: unknown): s is string => typeof s === "string" && UUID.test(s);

export interface HouseholdInput {
  label?: unknown;
  address?: unknown;
  town?: unknown;
  lat?: unknown;
  lng?: unknown;
  utility?: unknown;
  registeredWithUtility?: unknown;
  shareWithTown?: unknown;
  residentName?: unknown;
  residentPhone?: unknown;
  residentChannel?: unknown;
  residentAge?: unknown;
  livesAlone?: unknown;
  canLeaveUnassisted?: unknown;
  canReachBackup?: unknown;
  devices?: unknown;
  contacts?: unknown;
}

function text(v: unknown, name: string, max = 200): string {
  if (typeof v !== "string" || !v.trim()) throw new ValidationError(`${name} is required.`);
  if (v.length > max) throw new ValidationError(`${name} is too long.`);
  return v.trim();
}

export function parseBackupHours(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 720) throw new ValidationError("Backup hours must be between 0 and 720, or blank for none.");
  return n === 0 ? null : n;
}

async function validate(input: HouseholdInput) {
  const label = text(input.label, "Label", 80);
  const address = text(input.address, "Address", 300);

  if (!Array.isArray(input.devices) || input.devices.length === 0) throw new ValidationError("Add at least one device.");
  if (input.devices.length > 12) throw new ValidationError("Too many devices.");
  const deviceRows = (input.devices as Record<string, unknown>[]).map((d) => {
    if (!deviceTypeEnum.enumValues.includes(d.type as DeviceType)) throw new ValidationError("Pick a device type for every device.");
    return {
      id: isUuid(d.id) ? d.id : undefined,
      type: d.type as DeviceType,
      label: text(d.label, "Device name", 80),
      backupHours: parseBackupHours(d.backupHours),
      notes: typeof d.notes === "string" && d.notes.trim() ? d.notes.trim().slice(0, 300) : null,
    };
  });

  if (!Array.isArray(input.contacts) || input.contacts.length === 0) throw new ValidationError("Add at least one contact.");
  if (input.contacts.length > 4) throw new ValidationError("Up to 4 contacts.");
  const contactRows = (input.contacts as Record<string, unknown>[]).map((c, i) => {
    const name = text(c.name, `Contact ${i + 1} name`, 80);
    const phone = normalizePhone(typeof c.phone === "string" ? c.phone : "");
    if (!phone) throw new ValidationError(`${name}: enter the phone number with area code, for example +1 603 555 0123.`);
    if (c.channel !== "sms" && c.channel !== "voice" && c.channel !== "both") throw new ValidationError(`${name}: choose text, call or both.`);
    return {
      id: isUuid(c.id) ? c.id : undefined,
      name,
      phone,
      channel: c.channel as "sms" | "voice" | "both",
      priority: i + 1, // order in the list is the priority
      isTownVolunteer: c.isTownVolunteer === true,
    };
  });
  if (new Set(contactRows.map((c) => c.phone)).size !== contactRows.length) {
    throw new ValidationError("Two contacts share a phone number. Each contact needs their own.");
  }

  if (!utilityEnum.enumValues.includes(input.utility as Utility)) throw new ValidationError("Choose the electric utility.");

  // The person who lives there. Every answer is optional; blank means "not answered".
  const yesNo = (v: unknown): boolean | null => (v === true ? true : v === false ? false : null);
  const residentName = typeof input.residentName === "string" && input.residentName.trim() ? input.residentName.trim().slice(0, 60) : null;
  let residentPhone: string | null = null;
  if (typeof input.residentPhone === "string" && input.residentPhone.trim()) {
    residentPhone = normalizePhone(input.residentPhone);
    if (!residentPhone) throw new ValidationError("Their phone number: enter it with area code, for example 603 555 0123.");
    if (contactRows.some((c) => c.phone === residentPhone)) throw new ValidationError("Their phone number is also listed as a contact. Use a different number for the contact.");
  }
  let residentBirthYear: number | null = null;
  if (input.residentAge !== null && input.residentAge !== undefined && input.residentAge !== "") {
    const age = Number(input.residentAge);
    if (!Number.isInteger(age) || age < 18 || age > 120) throw new ValidationError("Age must be a whole number between 18 and 120.");
    // Stored as a birth year so it does not go stale.
    residentBirthYear = new Date().getUTCFullYear() - age;
  }

  let lat = Number(input.lat);
  let lng = Number(input.lng);
  let town = typeof input.town === "string" ? input.town.trim() : "";
  if (input.lat == null || input.lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    const hit = await locateInNH(address, town);
    if (hit === "outside") throw new ValidationError("That address came back outside New Hampshire. Pilot Light only covers NH. Add the town and NH to the address.");
    if (!hit) throw new ValidationError("We could not find that address in New Hampshire. Check the street and the town's spelling.");
    lat = hit.lat;
    lng = hit.lng;
    if (!town) town = hit.town;
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) throw new ValidationError("That location is not valid.");
  if (!town) throw new ValidationError("Town is required.");

  let zone;
  try {
    zone = await resolveZone(lat, lng);
  } catch (err) {
    console.error("Zone lookup failed:", err);
    throw new ValidationError("The National Weather Service could not match that address to a forecast zone. Try again in a minute.");
  }

  if (!zone.zone.startsWith("NH")) throw new ValidationError("That location is outside New Hampshire. Pilot Light only covers NH.");

  return {
    household: {
      label,
      address,
      town: town.slice(0, 80),
      lat,
      lng,
      nwsZone: zone.zone,
      zoneName: zone.zoneName,
      utility: input.utility as Utility,
      registeredWithUtility: input.registeredWithUtility === true,
      shareWithTown: input.shareWithTown === true,
      residentName,
      residentPhone,
      residentChannel: residentPhone ? ((input.residentChannel === "sms" ? "sms" : "voice") as "sms" | "voice") : null,
      residentBirthYear,
      livesAlone: yesNo(input.livesAlone),
      canLeaveUnassisted: yesNo(input.canLeaveUnassisted),
      canReachBackup: yesNo(input.canReachBackup),
    },
    deviceRows,
    contactRows,
  };
}

export async function saveHousehold(input: HouseholdInput, existingId?: string, ownerUserId?: string): Promise<string> {
  const v = await validate(input);
  return db.transaction(async (tx) => {
    let id = existingId;
    if (id) {
      const updated = await tx.update(households).set(v.household).where(eq(households.id, id)).returning({ id: households.id });
      if (updated.length === 0) throw new ValidationError("That household no longer exists.");
    } else {
      [{ id }] = await tx.insert(households).values({ ...v.household, ownerUserId: ownerUserId ?? null }).returning({ id: households.id });
      await tx.insert(householdState).values({ householdId: id });
    }

    // Rows keep their ids across edits so alert history stays attached.
    const keepDevices = v.deviceRows.flatMap((d) => (d.id ? [d.id] : []));
    await tx.delete(devices).where(keepDevices.length ? and(eq(devices.householdId, id), notInArray(devices.id, keepDevices)) : eq(devices.householdId, id));
    for (const d of v.deviceRows) {
      const values = { type: d.type, label: d.label, backupHours: d.backupHours, notes: d.notes };
      const hit = d.id ? await tx.update(devices).set(values).where(and(eq(devices.id, d.id), eq(devices.householdId, id))).returning({ id: devices.id }) : [];
      if (hit.length === 0) await tx.insert(devices).values({ householdId: id, ...values });
    }

    const keepContacts = v.contactRows.flatMap((c) => (c.id ? [c.id] : []));
    await tx.delete(contacts).where(keepContacts.length ? and(eq(contacts.householdId, id), notInArray(contacts.id, keepContacts)) : eq(contacts.householdId, id));
    for (const c of v.contactRows) {
      const values = { name: c.name, phone: c.phone, channel: c.channel, priority: c.priority, isTownVolunteer: c.isTownVolunteer };
      const hit = c.id ? await tx.update(contacts).set(values).where(and(eq(contacts.id, c.id), eq(contacts.householdId, id))).returning({ id: contacts.id }) : [];
      if (hit.length === 0) await tx.insert(contacts).values({ householdId: id, ...values });
    }
    return id;
  });
}

export async function getHousehold(id: string) {
  if (!isUuid(id)) return null;
  const [household] = await db.select().from(households).where(eq(households.id, id));
  if (!household) return null;
  const [deviceRows, contactRows] = await Promise.all([
    db.select().from(devices).where(eq(devices.householdId, id)).orderBy(devices.label),
    db.select().from(contacts).where(eq(contacts.householdId, id)).orderBy(contacts.priority),
  ]);
  return { household: { ...household, residentAge: ageFromBirthYear(household.residentBirthYear, new Date()) }, devices: deviceRows, contacts: contactRows };
}

// Everything the status screen shows, in one read.
export async function getStatus(id: string) {
  const base = await getHousehold(id);
  if (!base) return null;
  const clock = await getClock();
  const now = simNow(clock);
  const [state] = await db.select().from(householdState).where(eq(householdState.householdId, id));

  const [warning] = state?.activeAlertId
    ? await db
        .select({ id: nwsAlerts.id, event: nwsAlerts.event, headline: nwsAlerts.headline, onset: nwsAlerts.onset, expires: nwsAlerts.expires, replay: nwsAlerts.replay, raw: nwsAlerts.raw })
        .from(nwsAlerts)
        .where(eq(nwsAlerts.id, state.activeAlertId))
    : [];

  const inIncident = state && state.outageInferredAt && state.status !== "normal" && state.status !== "warning_active";
  const alerts = inIncident
    ? await db
        .select({
          id: alertsSent.id,
          contactId: alertsSent.contactId,
          threshold: alertsSent.threshold,
          channel: alertsSent.channel,
          sid: alertsSent.twilioSid,
          sentAt: alertsSent.sentAt,
          ackAt: alertsSent.ackAt,
          ackBody: alertsSent.ackBody,
          lastError: alertsSent.lastError,
        })
        .from(alertsSent)
        .where(and(eq(alertsSent.householdId, id), eq(alertsSent.outageInferredAt, state.outageInferredAt!)))
    : [];

  const log = await db
    .select({ id: events.id, at: events.at, kind: events.kind, message: events.message })
    .from(events)
    .where(eq(events.householdId, id))
    .orderBy(desc(events.id))
    .limit(60);

  // Chance this warning brings an outage to the county, from the trained model.
  // Null when no warning is in force or the model did not pass validation.
  const forecast = warning
    ? outageRisk({
        event: warning.event,
        zone: base.household.nwsZone,
        onset: warning.onset,
        expires: warning.expires,
        description: (warning.raw as { properties?: { description?: string } } | null)?.properties?.description ?? null,
      })
    : null;

  const limiting = limitingDevice(base.devices);
  const risk = riskFor(base.household, state, base.devices, state?.activeAlertId, now);
  return {
    ...base,
    resident: { name: base.household.residentName, phone: base.household.residentPhone, age: ageFromBirthYear(base.household.residentBirthYear, now) },
    risk: {
      tier: risk.tier,
      score: risk.score,
      factors: risk.factors,
      reason: risk.reason,
      prompt: risk.prompt,
      promptSentAt: risk.prompt === "not_sent" ? null : (state?.promptSentAt ?? null),
      recommended: recommendContact(risk.tier, { name: base.household.residentName, phone: base.household.residentPhone }, base.contacts, base.household.shareWithTown),
    },
    state: state ?? null,
    warning: warning ?? null,
    alerts,
    events: log,
    outageRisk: forecast ? { percent: Math.round(forecast.probability * 100), why: describeDrivers(forecast), auc: forecast.auc, baseRatePercent: Math.round(forecast.baseRate * 100) } : null,
    limitingDeviceId: limiting.device?.id ?? null,
    limitingHours: limiting.hours,
    clock: {
      now: now.toISOString(),
      multiplier: clock.multiplier,
      replayActive: clock.replayActive,
      replayHouseholdId: clock.householdId,
    },
    transport: transportMode(),
  };
}

export { TIER_RANK };
export type StatusPayload = NonNullable<Awaited<ReturnType<typeof getStatus>>>;

export async function listForTown(town: string) {
  const rows = await db
    .select({ household: households, state: householdState })
    .from(households)
    .leftJoin(householdState, eq(householdState.householdId, households.id))
    .where(and(eq(households.shareWithTown, true), ilike(households.town, town.replace(/[%_\\]/g, "")))) ;
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.household.id);
  const deviceRows = await db.select().from(devices).where(inArray(devices.householdId, ids));
  const checks = await db
    .select({ householdId: events.householdId, at: events.at, message: events.message })
    .from(events)
    .where(and(inArray(events.householdId, ids), eq(events.kind, "checked")))
    .orderBy(desc(events.id));
  const now = simNow(await getClock());
  return rows.map((r) => {
    const mine = deviceRows.filter((d) => d.householdId === r.household.id);
    return {
      ...r,
      devices: mine,
      risk: riskFor(r.household, r.state, mine, r.state?.activeAlertId, now),
      lastCheck: checks.find((c) => c.householdId === r.household.id) ?? null,
    };
  });
}
