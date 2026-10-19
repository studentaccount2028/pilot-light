// AI-assisted: written with Claude Code from the team's build spec.
// The page a neighbor or volunteer opens from their alert text (/r/<key>).
// The key is theirs alone. Address, phone and entry notes are shown only
// while there is an open incident; otherwise the page says there is nothing to do.
import { open } from "./security/fieldCrypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { alertsSent, contacts, devices, events, householdState, households } from "../db/schema";
import { getClock, simNow } from "./clock";
import { limitingDevice } from "./engine/rules";
import { inIncident, latestEms } from "./ems";
import { guidanceFor } from "./guidance";
import { isUuid } from "./households";
import { riskFor } from "./riskFor";

export async function contactByKey(key: string) {
  if (!isUuid(key)) return null;
  const [row] = await db.select({ contact: contacts, household: households }).from(contacts).innerJoin(households, eq(households.id, contacts.householdId)).where(eq(contacts.linkKey, key));
  // A volunteer sees a household only if the family shared it with the town.
  if (!row || (row.contact.isTownVolunteer && !row.household.shareWithTown)) return null;
  return row;
}

export async function responderView(key: string) {
  const row = await contactByKey(key);
  if (!row) return null;
  const { contact: me, household: h } = row;
  const clock = await getClock();
  const now = simNow(clock);
  const [state] = await db.select().from(householdState).where(eq(householdState.householdId, h.id));
  const base = {
    me: { id: me.id, name: me.name, volunteer: me.isTownVolunteer },
    household: { label: h.label, town: h.town },
    clock: { now: now.toISOString(), multiplier: clock.multiplier, replayActive: clock.replayActive },
  };
  if (!inIncident(state)) return { ...base, active: false as const, status: state?.status ?? "normal" };

  const key0 = state!.outageInferredAt!;
  const [deviceRows, people, alerts, log, ems] = await Promise.all([
    db.select().from(devices).where(eq(devices.householdId, h.id)),
    db.select().from(contacts).where(eq(contacts.householdId, h.id)).orderBy(contacts.priority),
    db.select().from(alertsSent).where(and(eq(alertsSent.householdId, h.id), eq(alertsSent.outageInferredAt, key0))),
    db
      .select({ id: events.id, at: events.at, kind: events.kind, message: events.message })
      .from(events)
      .where(and(eq(events.householdId, h.id), inArray(events.kind, ["threshold", "ack", "checked", "help", "ems", "probable_outage", "countdown"])))
      .orderBy(desc(events.id))
      .limit(12),
    latestEms(h.id, key0),
  ]);

  const helpRequested = state!.status === "resolved" && state!.resolvedReason === "help";
  const remainingMs = !helpRequested && state!.countdownZeroAt ? state!.countdownZeroAt.getTime() - now.getTime() : null;
  const risk = riskFor(h, state, deviceRows, state!.activeAlertId, now);
  const limiting = limitingDevice(deviceRows);

  // Who else has the alert and where they are, so neighbors don't all drive over.
  const team = people
    .filter((c) => !c.isTownVolunteer || h.shareWithTown)
    .flatMap((c) => {
      const mine = alerts.filter((a) => a.contactId === c.id && a.twilioSid && a.threshold !== "all_clear");
      if (mine.length === 0) return [];
      const arrivedAt = mine.map((a) => a.arrivedAt).find(Boolean) ?? null;
      const etaAt = mine.filter((a) => a.etaAt).sort((a, b) => a.ackAt!.getTime() - b.ackAt!.getTime()).at(-1)?.etaAt ?? null;
      const help = mine.some((a) => a.ackBody === "HELP");
      const seen = mine.some((a) => a.ackAt);
      const stage = arrivedAt ? "arrived" : etaAt ? "on_way" : help ? "help" : seen ? "seen" : "alerted";
      return [{ id: c.id, name: c.name, phone: c.phone, volunteer: c.isTownVolunteer, isMe: c.id === me.id, stage, etaAt, arrivedAt }];
    });

  return {
    ...base,
    active: true as const,
    status: state!.status,
    helpRequested,
    remainingMs,
    countdownZeroAt: state!.countdownZeroAt,
    tier: risk.tier,
    reason: risk.reason,
    address: h.address,
    lat: h.lat,
    lng: h.lng,
    accessNotes: open(h.accessNotes),
    resident: { name: h.residentName, phone: h.residentPhone, livesAlone: h.livesAlone, canLeaveUnassisted: h.canLeaveUnassisted },
    devices: deviceRows.map((d) => ({ label: d.label, type: d.type, backupHours: d.backupHours, limiting: d.id === limiting.device?.id })),
    team,
    alerted: team.some((t) => t.isMe),
    ems: ems ? { status: ems.status, label: ems.label, unit: ems.unit, note: ems.note, at: ems.at } : null,
    events: log,
    steps: guidanceFor({
      residentName: h.residentName,
      residentPhone: h.residentPhone,
      address: h.address,
      devices: deviceRows,
      remainingMs,
      helpRequested,
      tier: risk.tier,
      livesAlone: h.livesAlone,
      canLeaveUnassisted: h.canLeaveUnassisted,
      accessNotes: open(h.accessNotes),
    }),
  };
}

export type ResponderView = NonNullable<Awaited<ReturnType<typeof responderView>>>;
