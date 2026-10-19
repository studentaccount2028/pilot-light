// AI-assisted: written with Claude Code from the team's build spec.
// The EMS board: every shared household that is in an outage or asked for
// help, most urgent first, with what a crew needs before they roll (mobility,
// devices, how to get in, which neighbor is already there). EMS status
// updates are logged to the household so the family and neighbors see them.
import { open } from "./security/fieldCrypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { alertsSent, contacts, devices, emsStatusEnum, emsUpdates, householdState, households, type EmsStatus } from "../db/schema";
import { getClock, simNow } from "./clock";
import { TIER_RANK } from "./engine/risk";
import { limitingDevice } from "./engine/rules";
import { logEvent } from "./events";
import { riskFor } from "./riskFor";

export const EMS_STATUS_LABEL: Record<EmsStatus, string> = {
  assigned: "Unit assigned",
  en_route: "En route",
  on_scene: "On scene",
  sheltered: "Moved to shelter",
  transported: "Transported",
  cleared: "Cleared, no transport",
};

export const isEmsStatus = (s: unknown): s is EmsStatus => typeof s === "string" && (emsStatusEnum.enumValues as readonly string[]).includes(s);

type Stage = "alerted" | "seen" | "help" | "on_way" | "arrived";

// One contact's alerts for this incident, folded to where they are now.
function stageOf(rows: (typeof alertsSent.$inferSelect)[]): { stage: Stage; etaAt: Date | null; arrivedAt: Date | null } | null {
  const sent = rows.filter((a) => a.twilioSid && a.threshold !== "all_clear");
  if (sent.length === 0) return null;
  const arrivedAt = sent.map((a) => a.arrivedAt).filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const etaAt = sent.filter((a) => a.etaAt && a.ackAt).sort((a, b) => a.ackAt!.getTime() - b.ackAt!.getTime()).at(-1)?.etaAt ?? null;
  const help = sent.some((a) => a.ackBody === "HELP");
  const seen = sent.some((a) => a.ackAt);
  return { stage: arrivedAt ? "arrived" : etaAt ? "on_way" : help ? "help" : seen ? "seen" : "alerted", etaAt, arrivedAt };
}

export async function latestEms(householdId: string, incidentAt: Date | null) {
  if (!incidentAt) return null;
  const [row] = await db
    .select()
    .from(emsUpdates)
    .where(and(eq(emsUpdates.householdId, householdId), eq(emsUpdates.incidentAt, incidentAt)))
    .orderBy(desc(emsUpdates.id))
    .limit(1);
  return row ? { ...row, label: EMS_STATUS_LABEL[row.status] } : null;
}

export function inIncident(state: { status: string; resolvedReason: string | null; outageInferredAt: Date | null } | null | undefined): boolean {
  if (!state?.outageInferredAt) return false;
  return state.status === "probable_outage" || state.status === "countdown" || (state.status === "resolved" && state.resolvedReason === "help");
}

export async function emsBoard() {
  const clock = await getClock();
  const now = simNow(clock);
  // Only households whose family chose to share with the town.
  const rows = await db
    .select({ household: households, state: householdState })
    .from(households)
    .leftJoin(householdState, eq(householdState.householdId, households.id))
    .where(eq(households.shareWithTown, true));
  const ids = rows.map((r) => r.household.id);
  const [deviceRows, contactRows, alertRows, emsRows] = ids.length
    ? await Promise.all([
        db.select().from(devices).where(inArray(devices.householdId, ids)),
        db.select().from(contacts).where(inArray(contacts.householdId, ids)).orderBy(contacts.priority),
        db.select().from(alertsSent).where(inArray(alertsSent.householdId, ids)),
        db.select().from(emsUpdates).where(inArray(emsUpdates.householdId, ids)).orderBy(desc(emsUpdates.id)),
      ])
    : [[], [], [], []];

  const watching = rows
    .filter((r) => r.state?.status === "warning_active")
    .map(({ household: h }) => ({ id: h.id, label: h.label, town: h.town, devices: deviceRows.filter((d) => d.householdId === h.id).map((d) => d.type) }));

  const incidents = rows.filter((r) => inIncident(r.state)).map(({ household: h, state }) => {
    const mine = deviceRows.filter((d) => d.householdId === h.id);
    const key = state!.outageInferredAt!.getTime();
    const incidentAlerts = alertRows.filter((a) => a.householdId === h.id && a.outageInferredAt.getTime() === key);
    const helpRequested = state!.status === "resolved" && state!.resolvedReason === "help";
    const remainingMs = !helpRequested && state!.countdownZeroAt ? state!.countdownZeroAt.getTime() - now.getTime() : null;
    const risk = riskFor(h, state, mine, state!.activeAlertId, now);
    const limiting = limitingDevice(mine);
    const history = emsRows.filter((e) => e.householdId === h.id && e.incidentAt.getTime() === key);
    return {
      id: h.id,
      label: h.label,
      address: h.address,
      town: h.town,
      lat: h.lat,
      lng: h.lng,
      status: state!.status,
      helpRequested,
      outageInferredAt: state!.outageInferredAt,
      remainingMs,
      tier: risk.tier,
      reason: risk.reason,
      resident: {
        name: h.residentName,
        phone: h.residentPhone,
        age: h.residentBirthYear ? now.getUTCFullYear() - h.residentBirthYear : null,
        livesAlone: h.livesAlone,
        canLeaveUnassisted: h.canLeaveUnassisted,
      },
      accessNotes: open(h.accessNotes),
      devices: mine.map((d) => ({ type: d.type, label: d.label, backupHours: d.backupHours, limiting: d.id === limiting.device?.id })),
      responders: contactRows
        .filter((c) => c.householdId === h.id)
        .flatMap((c) => {
          const s = stageOf(incidentAlerts.filter((a) => a.contactId === c.id));
          return s ? [{ id: c.id, name: c.name, phone: c.phone, volunteer: c.isTownVolunteer, ...s }] : [];
        }),
      ems: history[0] ? { ...history[0], label: EMS_STATUS_LABEL[history[0].status] } : null,
      emsHistory: history.map((e) => ({ ...e, label: EMS_STATUS_LABEL[e.status] })),
    };
  });

  // HELP first, then backup out, then least time left; cleared calls sink.
  const urgency = (r: (typeof incidents)[number]) => (r.ems?.status === "cleared" || r.ems?.status === "transported" || r.ems?.status === "sheltered" ? 2 : r.helpRequested || (r.remainingMs ?? 1) <= 0 ? 0 : 1);
  incidents.sort((a, b) => urgency(a) - urgency(b) || (a.remainingMs ?? -1) - (b.remainingMs ?? -1) || TIER_RANK[a.tier] - TIER_RANK[b.tier]);

  // Ahead of the storm: how many households under a warning depend on each device.
  const byDevice: Record<string, number> = {};
  for (const w of watching) for (const t of new Set(w.devices)) byDevice[t] = (byDevice[t] ?? 0) + 1;

  return { now: now.toISOString(), multiplier: clock.multiplier, replayActive: clock.replayActive, shared: rows.length, incidents, watching, byDevice };
}

export type EmsBoard = Awaited<ReturnType<typeof emsBoard>>;

// Record what EMS is doing. Only while the household has an open incident.
export async function recordEms(input: { householdId: string; status: EmsStatus; unit: string | null; note: string | null }): Promise<{ ok: true } | { error: string }> {
  const [row] = await db
    .select({ household: households, state: householdState })
    .from(households)
    .leftJoin(householdState, eq(householdState.householdId, households.id))
    .where(and(eq(households.id, input.householdId), eq(households.shareWithTown, true)));
  if (!row) return { error: "That household is not shared with EMS." };
  if (!inIncident(row.state)) return { error: "That household has no open incident." };
  const at = simNow(await getClock());
  await db.insert(emsUpdates).values({ householdId: input.householdId, incidentAt: row.state!.outageInferredAt!, status: input.status, unit: input.unit, note: input.note, at });
  const unit = input.unit ? `${input.unit}: ` : "";
  await logEvent(db, {
    householdId: input.householdId,
    at,
    kind: "ems",
    message: `EMS ${unit}${EMS_STATUS_LABEL[input.status].toLowerCase()}.${input.note ? ` ${input.note}` : ""}`,
    data: { status: input.status, unit: input.unit },
  });
  return { ok: true };
}
