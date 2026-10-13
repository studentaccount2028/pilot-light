// AI-assisted: written with Claude Code from the team's build spec.
// The tick worker: loads each household, asks rules.ts what should be true,
// writes household_state, and delivers alerts. Safe to run from several
// processes at once (worker, cron route, heartbeat route, replay CLI).
import { and, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "../../db/client";
import {
  alertsSent,
  contacts as contactsTable,
  devices as devicesTable,
  householdState,
  households,
  nwsAlerts,
  type AlertKind,
  type Contact,
  type Household,
  type SendChannel,
} from "../../db/schema";
import { getClock, simNow } from "../clock";
import { logEvent } from "../events";
import { allClearText, sayTwiml, stormPromptSms, stormPromptTwiml, thresholdSms, thresholdVoice, voiceTwiml } from "../messages";
import { riskFor } from "../riskFor";
import { TIER_LABEL, type Tier } from "./risk";
import { placeCall, publicBaseUrl, sendSms, transportMode } from "../twilio";
import { channelsFor, decide, findActiveWarning, limitingDevice, recipientsFor, WARNING_EVENTS, type Threshold } from "./rules";

const MAX_ATTEMPTS = 5;
const RETRY_LEASE_MS = 30_000;
const THRESHOLD_LABEL: Record<Threshold, string> = { h6: "6 h", h2: "2 h", h0: "0 h" };

export async function tick(): Promise<{ households: number }> {
  const ids = await db.select({ id: households.id }).from(households);
  for (const { id } of ids) {
    try {
      await evaluateHousehold(id);
    } catch (err) {
      // One bad household must not stop the others from being checked.
      console.error(`tick: household ${id} failed`, err);
    }
  }
  return { households: ids.length };
}

export async function evaluateHousehold(householdId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const clock = await getClock(tx);
    const now = simNow(clock);

    // Row lock: concurrent evaluators take turns, so each sees the last one's state.
    await tx.insert(householdState).values({ householdId }).onConflictDoNothing();
    const [state] = await tx.select().from(householdState).where(eq(householdState.householdId, householdId)).for("update");
    const [household] = await tx.select().from(households).where(eq(households.id, householdId));
    if (!household || !state) return;

    const devices = await tx.select().from(devicesTable).where(eq(devicesTable.householdId, householdId));
    const contacts = await tx.select().from(contactsTable).where(eq(contactsTable.householdId, householdId));
    const alerts = await tx
      .select()
      .from(nwsAlerts)
      .where(and(inArray(nwsAlerts.event, [...WARNING_EVENTS]), sql`${household.nwsZone} = ANY(${nwsAlerts.zones})`));

    // A replayed warning exists only for the household being replayed. Every
    // other household in that zone keeps seeing the real weather.
    const mine = alerts.filter((a) => !a.replay || (clock.replayActive && clock.householdId === householdId));
    const warning = findActiveWarning(mine, household.nwsZone, now);
    // The risk tier decides how fast and how wide the ladder goes.
    const risk = riskFor(household, state, devices, warning?.id ?? state.activeAlertId, now);
    const d = decide({ now, state, warning, devices, tier: risk.tier });

    await tx
      .update(householdState)
      .set({
        status: d.status,
        outageInferredAt: d.outageInferredAt,
        countdownZeroAt: d.countdownZeroAt,
        activeAlertId: d.activeAlertId,
        resolvedReason: d.resolvedReason,
        updatedAt: now,
      })
      .where(eq(householdState.householdId, householdId));

    for (const t of d.transitions) {
      await logEvent(tx, { householdId, at: now, kind: t.kind, message: t.message });
    }

    if (d.fire && d.outageInferredAt && d.countdownZeroAt) {
      await armThreshold(tx, {
        household,
        contacts,
        threshold: d.fire,
        outageInferredAt: d.outageInferredAt,
        deviceLabel: limitingDevice(devices).device?.label ?? "Medical device",
        remainingMs: d.countdownZeroAt.getTime() - now.getTime(),
        tier: risk.tier,
        reason: risk.reason,
        now,
      });
    }

    if (d.allClear && d.outageInferredAt) {
      await armAllClear(tx, { household, contacts, outageInferredAt: d.outageInferredAt });
    }
  });

  await sendStormPrompt(householdId);
  await deliverPending(householdId);
}

// When a warning starts, ask the resident once whether their backup is ready.
// Claimed with an atomic update first, so two workers cannot both send it.
async function sendStormPrompt(householdId: string): Promise<void> {
  const [row] = await db
    .select({ household: households, state: householdState })
    .from(households)
    .innerJoin(householdState, eq(householdState.householdId, households.id))
    .where(eq(households.id, householdId));
  if (!row) return;
  const { household, state } = row;
  const alertId = state.activeAlertId;
  // Only while watching: once the outage is inferred their phone may be dead too.
  if (state.status !== "warning_active" || !alertId || !household.residentPhone) return;
  if (state.promptAlertId === alertId || state.promptAttempts >= 3) return;

  const at = simNow(await getClock());
  const [claimed] = await db
    .update(householdState)
    .set({ promptAlertId: alertId, promptSentAt: at, promptConfirmedAt: null, promptAttempts: sql`${householdState.promptAttempts} + 1` })
    .where(and(eq(householdState.householdId, householdId), sql`${householdState.promptAlertId} IS DISTINCT FROM ${alertId}`))
    .returning({ id: householdState.householdId });
  if (!claimed) return;

  const [alert] = await db.select({ event: nwsAlerts.event }).from(nwsAlerts).where(eq(nwsAlerts.id, alertId));
  const event = alert?.event ?? "storm warning";
  const who = household.residentName?.trim() || "the resident";
  const tag = transportMode() === "simulated" ? "SIMULATED " : "";
  try {
    if (household.residentChannel === "voice") {
      const base = publicBaseUrl();
      await placeCall(household.residentPhone, stormPromptTwiml(event, base ? `${base}/api/twilio/voice?prompt=${householdId}` : null));
    } else {
      await sendSms(household.residentPhone, stormPromptSms(event));
    }
    await db.update(householdState).set({ promptAttempts: 0 }).where(eq(householdState.householdId, householdId));
    await logEvent(db, { householdId, at, kind: "prompt", message: `${tag}Storm prompt sent to ${who}: is the backup charged, plugged in and within reach?` });
  } catch (err) {
    // Release the claim so the next tick tries again, up to three times.
    await db.update(householdState).set({ promptAlertId: null, promptSentAt: null }).where(eq(householdState.householdId, householdId));
    await logEvent(db, { householdId, at, kind: "send_failed", message: `Storm prompt to ${who} failed, will retry: ${err instanceof Error ? err.message : String(err)}` });
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Insert first, send second. The unique index rejects the duplicate when two
// ticks race, so a family can never be texted twice for the same threshold.
async function armThreshold(
  tx: Tx,
  a: {
    household: Household;
    contacts: Contact[];
    threshold: Threshold;
    outageInferredAt: Date;
    deviceLabel: string;
    remainingMs: number;
    tier: Tier;
    reason: string | null;
    now: Date;
  },
) {
  const ctx = {
    label: a.household.label,
    town: a.household.town,
    address: a.household.address,
    deviceLabel: a.deviceLabel,
    remainingMs: a.remainingMs,
    tier: a.tier,
    reason: a.reason,
    residentName: a.household.residentName,
    residentPhone: a.household.residentPhone,
  };
  const rows = recipientsFor(a.threshold, a.contacts, a.household.shareWithTown, a.tier).flatMap((c) =>
    channelsFor(c).map((channel) => ({
      householdId: a.household.id,
      outageInferredAt: a.outageInferredAt,
      threshold: a.threshold as AlertKind,
      contactId: c.id,
      channel,
      body:
        channel === "sms"
          ? thresholdSms(a.threshold, ctx, { volunteer: c.isTownVolunteer })
          : thresholdVoice(a.threshold, ctx, { volunteer: c.isTownVolunteer }),
    })),
  );
  if (rows.length === 0) return;
  const inserted = await tx.insert(alertsSent).values(rows).onConflictDoNothing().returning({ id: alertsSent.id });
  if (inserted.length > 0) {
    await logEvent(tx, {
      householdId: a.household.id,
      at: a.now,
      kind: "threshold",
      message: `${THRESHOLD_LABEL[a.threshold]} alert (${TIER_LABEL[a.tier]}). Alerting ${inserted.length} contact channel(s).`,
      data: { threshold: a.threshold, tier: a.tier },
    });
  }
}

// One all-clear per incident to everyone who was actually reached, even if
// heartbeats flap: the same unique index is the rate limit.
async function armAllClear(tx: Tx, a: { household: Household; contacts: Contact[]; outageInferredAt: Date }) {
  const reached = await tx
    .selectDistinct({ contactId: alertsSent.contactId })
    .from(alertsSent)
    .where(
      and(
        eq(alertsSent.householdId, a.household.id),
        eq(alertsSent.outageInferredAt, a.outageInferredAt),
        isNotNull(alertsSent.twilioSid),
      ),
    );
  const ids = new Set(reached.map((r) => r.contactId));
  const rows = a.contacts
    .filter((c) => c.active && ids.has(c.id))
    .map((c) => ({
      householdId: a.household.id,
      outageInferredAt: a.outageInferredAt,
      threshold: "all_clear" as AlertKind,
      contactId: c.id,
      channel: (c.channel === "voice" ? "voice" : "sms") as SendChannel,
      body: allClearText(a.household.label),
    }));
  if (rows.length > 0) await tx.insert(alertsSent).values(rows).onConflictDoNothing();
}

// Sends every undelivered alert for the household's current incident. A row
// is claimed with a short lease before the network call; a failed send leaves
// twilio_sid null so the next tick retries it.
export async function deliverPending(householdId: string, incidentKey?: Date): Promise<void> {
  const [state] = await db.select().from(householdState).where(eq(householdState.householdId, householdId));
  // incidentKey is given for a help notice raised outside an outage.
  const key = incidentKey ?? state?.outageInferredAt;
  if (!state || !key) return;

  const escalating = !incidentKey && (state.status === "probable_outage" || state.status === "countdown");
  const kinds: AlertKind[] = escalating ? ["h6", "h2", "h0", "help", "all_clear"] : ["help", "all_clear"];

  const pending = await db
    .select()
    .from(alertsSent)
    .where(
      and(
        eq(alertsSent.householdId, householdId),
        eq(alertsSent.outageInferredAt, key),
        isNull(alertsSent.twilioSid),
        lt(alertsSent.attempts, MAX_ATTEMPTS),
        inArray(alertsSent.threshold, kinds),
      ),
    );
  if (pending.length === 0) return;

  const contacts = await db.select().from(contactsTable).where(eq(contactsTable.householdId, householdId));
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const simulated = transportMode() === "simulated";

  for (const row of pending) {
    const contact = byId.get(row.contactId);
    if (!contact || !contact.active) continue;

    const leaseCutoff = new Date(Date.now() - RETRY_LEASE_MS);
    const [claimed] = await db
      .update(alertsSent)
      .set({ attemptAt: new Date(), attempts: sql`${alertsSent.attempts} + 1` })
      .where(
        and(
          eq(alertsSent.id, row.id),
          isNull(alertsSent.twilioSid),
          or(isNull(alertsSent.attemptAt), lt(alertsSent.attemptAt, leaseCutoff)),
        ),
      )
      .returning({ id: alertsSent.id });
    if (!claimed) continue; // another worker has it

    const at = simNow(await getClock());
    const tag = simulated ? "SIMULATED " : "";
    try {
      let sid: string;
      if (row.channel === "sms") {
        sid = await sendSms(contact.phone, row.body);
      } else {
        const base = publicBaseUrl();
        const interactive = row.threshold === "h6" || row.threshold === "h2" || row.threshold === "h0";
        const twiml = interactive
          ? voiceTwiml(row.body, base ? `${base}/api/twilio/voice?alert=${row.id}` : null)
          : sayTwiml(row.body);
        sid = await placeCall(contact.phone, twiml);
      }
      await db.update(alertsSent).set({ twilioSid: sid, sentAt: at, lastError: null }).where(eq(alertsSent.id, row.id));
      await logEvent(db, {
        householdId,
        at,
        kind: "sent",
        message: `${tag}${row.channel === "sms" ? "SMS" : "Voice call"} to ${contact.name} (${row.threshold}): ${row.body}`,
        data: { alertId: row.id, contactId: contact.id, channel: row.channel, threshold: row.threshold, sid, simulated },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db.update(alertsSent).set({ lastError: message }).where(eq(alertsSent.id, row.id));
      await logEvent(db, {
        householdId,
        at,
        kind: "send_failed",
        message: `${row.channel === "sms" ? "SMS" : "Voice call"} to ${contact.name} failed, will retry: ${message}`,
        data: { alertId: row.id, contactId: contact.id },
      });
    }
  }
}
