// AI-assisted: written with Claude Code from the team's build spec.
// One-tap replies. SMS words and voice key presses both land here:
// OK / HELP / CHECKED / STOP, anything else gets the list of valid words.
// "OK 20" also says how many minutes away the person is.
import { and, desc, eq, inArray, isNotNull, or } from "drizzle-orm";
import { db } from "../db/client";
import { alertsSent, contacts, householdState, households, type AlertKind, type SendChannel } from "../db/schema";
import { getClock, simNow } from "./clock";
import { deliverPending } from "./engine/tick";
import { logEvent } from "./events";
import { helpCascadeText, REPLY_HELP_TEXT } from "./messages";
import { drivingRoute } from "./routes";
import { responderLink } from "./twilio";

export type ReplyWord = "OK" | "HELP" | "CHECKED" | "STOP" | "OTHER";

export function parseReply(body: string): ReplyWord {
  // The word is what comes before any minutes: "OK 20", "on my way, 15 min".
  const word = body.replace(/\d[\s\S]*$/, "").trim().toUpperCase().replace(/[^A-Z]/g, "");
  if (["OK", "OKAY", "YES", "Y", "READY", "OMW", "OTW", "ONMYWAY", "ONTHEWAY", "COMING", "GOING"].includes(word)) return "OK";
  if (word === "HELP") return "HELP";
  if (["CHECKED", "HERE", "ARRIVED", "IMHERE"].includes(word)) return "CHECKED";
  if (["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"].includes(word)) return "STOP";
  return "OTHER";
}

// Minutes away from a reply like "OK 20", "omw 1h" or "on my way, 45 min".
// Null when no number is given; capped at 8 hours.
export function parseEtaMinutes(body: string): number | null {
  const m = body.toLowerCase().match(/(\d{1,3}(?:\.\d)?)\s*(h|hr|hrs|hour|hours)?\b/);
  if (!m) return null;
  const minutes = Math.round(Number(m[1]) * (m[2] ? 60 : 1));
  return minutes >= 1 && minutes <= 480 ? minutes : null;
}

export function parseDigit(digit: string): ReplyWord {
  if (digit === "1") return "OK";
  if (digit === "2") return "HELP";
  return "OTHER";
}

// Returns the text to send back to the sender (null = say nothing).
export async function handleReply(input: { fromPhone: string; word: ReplyWord; via: "sms" | "voice" | "simulated" | "web"; etaMinutes?: number | null }): Promise<string | null> {
  const now = simNow(await getClock());
  const residentReply = await handleResidentReply(input.fromPhone, input.word, input.via, now);
  if (residentReply !== undefined) return residentReply;

  const mine = await db.select().from(contacts).where(eq(contacts.phone, input.fromPhone));
  if (mine.length === 0) {
    return "This number is not registered with Pilot Light. Call 911 for any emergency.";
  }

  if (input.word === "STOP") {
    // Twilio handles the opt-out itself; we just stop trying to reach them.
    await db.update(contacts).set({ active: false }).where(eq(contacts.phone, input.fromPhone));
    for (const c of mine) {
      await logEvent(db, { householdId: c.householdId, at: now, kind: "opt_out", message: `${c.name} replied STOP and will no longer be contacted.` });
    }
    return null;
  }

  if (input.word === "OTHER") return REPLY_HELP_TEXT;

  // Find the open incident this person was alerted about most recently. An
  // incident someone answered HELP to stays open for replies: that is when
  // knowing who is on the way matters most.
  const [latest] = await db
    .select({ alert: alertsSent, contact: contacts, state: householdState })
    .from(alertsSent)
    .innerJoin(contacts, eq(contacts.id, alertsSent.contactId))
    .innerJoin(householdState, eq(householdState.householdId, alertsSent.householdId))
    .where(
      and(
        inArray(alertsSent.contactId, mine.map((c) => c.id)),
        isNotNull(alertsSent.twilioSid),
        inArray(alertsSent.threshold, ["h6", "h2", "h0", "help"]),
        or(inArray(householdState.status, ["probable_outage", "countdown"]), and(eq(householdState.status, "resolved"), eq(householdState.resolvedReason, "help"))),
        eq(alertsSent.outageInferredAt, householdState.outageInferredAt),
      ),
    )
    .orderBy(desc(alertsSent.sentAt))
    .limit(1);

  if (!latest) return "Pilot Light: there is no active alert for you right now. Call 911 for any emergency.";

  const { alert, contact } = latest;
  const householdId = alert.householdId;
  if (input.word === "CHECKED") {
    await db.update(alertsSent).set({ ackAt: alert.ackAt ?? now, ackBody: "CHECKED", arrivedAt: now }).where(eq(alertsSent.id, alert.id));
    await logEvent(db, {
      householdId,
      at: now,
      kind: "checked",
      message: `${contact.name} replied ${input.word} (${input.via}): arrived and checked on the household in person.`,
      data: { contactId: contact.id, alertId: alert.id },
    });
    return "Pilot Light: thank you, logged as arrived. If anyone needs medical help, call 911 now.";
  }

  if (input.word === "OK") {
    // No minutes given: if we know where they are, the drive time is the estimate.
    let minutes = input.etaMinutes ?? null;
    let fromRoad = false;
    if (!minutes && contact.lat != null && contact.lng != null) {
      const [home] = await db.select({ lat: households.lat, lng: households.lng }).from(households).where(eq(households.id, householdId));
      if (home) {
        minutes = (await drivingRoute({ lat: contact.lat, lng: contact.lng }, home)).minutes;
        fromRoad = true;
      }
    }
    const eta = minutes ? new Date(now.getTime() + minutes * 60_000) : null;
    await db.update(alertsSent).set({ ackAt: now, ackBody: "OK", etaAt: eta }).where(eq(alertsSent.id, alert.id));
    await logEvent(db, {
      householdId,
      at: now,
      kind: "ack",
      message: eta
        ? `${contact.name} replied OK (${input.via}): saw the alert and is on the way, about ${minutes} min out${fromRoad ? ` (drive time from ${contact.place ?? "their location"})` : ""}.`
        : `${contact.name} replied OK (${input.via}): saw the alert and is handling it.`,
      data: { contactId: contact.id, alertId: alert.id, etaMinutes: minutes },
    });
    return eta
      ? `Pilot Light: thank you, the family can see you're on the way (about ${minutes} min). Reply HERE when you arrive. Call 911 for any emergency.`
      : "Pilot Light: thank you, logged. If you're going, reply with your minutes away (like OK 20), and HERE when you arrive. Call 911 for any emergency.";
  }

  await db.update(alertsSent).set({ ackAt: now, ackBody: input.word }).where(eq(alertsSent.id, alert.id));

  // HELP: stop the ladder and tell everyone else, in one transaction.
  const [household] = await db.select().from(households).where(eq(households.id, householdId));
  const cascaded = await db.transaction(async (tx) => {
    const [state] = await tx.select().from(householdState).where(eq(householdState.householdId, householdId)).for("update");
    if (!state?.outageInferredAt || (state.status !== "probable_outage" && state.status !== "countdown")) return false;
    await tx
      .update(householdState)
      .set({ status: "resolved", resolvedReason: "help", updatedAt: now })
      .where(eq(householdState.householdId, householdId));
    const others = (await tx.select().from(contacts).where(eq(contacts.householdId, householdId))).filter(
      (c) => c.active && c.id !== contact.id && (!c.isTownVolunteer || household.shareWithTown),
    );
    if (others.length > 0) {
      await tx
        .insert(alertsSent)
        .values(
          others.map((c) => ({
            householdId,
            outageInferredAt: state.outageInferredAt!,
            threshold: "help" as AlertKind,
            contactId: c.id,
            channel: (c.channel === "voice" ? "voice" : "sms") as SendChannel,
            body: helpCascadeText(contact.name, household.label, household.address, responderLink(c.linkKey)),
          })),
        )
        .onConflictDoNothing();
    }
    await logEvent(tx, {
      householdId,
      at: now,
      kind: "help",
      message: `${contact.name} replied HELP (${input.via}). Escalation stopped; alerting ${others.length} other contact(s). If this is an emergency, call 911.`,
      data: { contactId: contact.id, alertId: alert.id },
    });
    return true;
  });

  if (!cascaded) return "Pilot Light: logged. Help was already requested and everyone has been told. If this is an emergency, call 911 now.";
  await deliverPending(householdId);
  return "Pilot Light: logged. The other contacts are being alerted now. If this is an emergency, call 911 now.";
}

// A reply from the person who lives there. YES answers the storm prompt;
// HELP goes straight to every contact. Returns undefined if this number is
// not a resident's, so the caller carries on with the contact handling.
export async function handleResidentReply(fromPhone: string, word: ReplyWord, via: string, now: Date, onlyHouseholdId?: string): Promise<string | null | undefined> {
  const homes = (await db.select().from(households).where(eq(households.residentPhone, fromPhone))).filter((h) => !onlyHouseholdId || h.id === onlyHouseholdId);
  if (homes.length === 0) return undefined;
  if (word === "STOP") return null;
  if (word !== "OK" && word !== "HELP") return "Pilot Light: reply YES if your backup is ready, or HELP if you need help. Call 911 for any emergency.";

  for (const home of homes) {
    const who = home.residentName?.trim() || "The resident";
    if (word === "OK") {
      const [state] = await db.select().from(householdState).where(eq(householdState.householdId, home.id));
      if (state?.promptAlertId && !state.promptConfirmedAt) {
        await db.update(householdState).set({ promptConfirmedAt: now }).where(eq(householdState.householdId, home.id));
        await logEvent(db, { householdId: home.id, at: now, kind: "prompt_reply", message: `${who} replied ready (${via}): backup charged, plugged in and within reach.` });
      }
      continue;
    }
    // HELP from the resident: tell every contact now, whatever the state.
    const people = (await db.select().from(contacts).where(eq(contacts.householdId, home.id))).filter((c) => c.active && (!c.isTownVolunteer || home.shareWithTown));
    const key = await db.transaction(async (tx) => {
      const [state] = await tx.select().from(householdState).where(eq(householdState.householdId, home.id)).for("update");
      const inIncident = state?.status === "probable_outage" || state?.status === "countdown";
      const incidentKey = inIncident && state?.outageInferredAt ? state.outageInferredAt : now;
      if (inIncident) await tx.update(householdState).set({ status: "resolved", resolvedReason: "help", updatedAt: now }).where(eq(householdState.householdId, home.id));
      if (people.length > 0) {
        await tx
          .insert(alertsSent)
          .values(
            people.map((c) => ({
              householdId: home.id,
              outageInferredAt: incidentKey,
              threshold: "help" as AlertKind,
              contactId: c.id,
              channel: (c.channel === "voice" ? "voice" : "sms") as SendChannel,
              body: helpCascadeText(who, home.label, home.address, responderLink(c.linkKey)),
            })),
          )
          .onConflictDoNothing();
      }
      await logEvent(tx, { householdId: home.id, at: now, kind: "help", message: `${who} asked for HELP (${via}). Alerting ${people.length} contact(s). If this is an emergency, call 911.` });
      return incidentKey;
    });
    await deliverPending(home.id, key);
  }
  return word === "OK" ? "Pilot Light: thank you. We will let your family know you are ready. Call 911 for any emergency." : "Pilot Light: your contacts are being alerted now. If this is an emergency, call 911 now.";
}
