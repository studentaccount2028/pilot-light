// AI-assisted: written with Claude Code from the team's build spec.
// The household is the unit; everything hangs off it. All timestamps are UTC.
import {
  bigserial,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const utilityEnum = pgEnum("utility", ["eversource", "unitil", "liberty", "nhec", "other"]);
export const deviceTypeEnum = pgEnum("device_type", [
  "o2_concentrator",
  "cpap",
  "power_chair",
  "home_dialysis",
  "fridge_meds",
  "electric_heat",
]);
export const contactChannelEnum = pgEnum("contact_channel", ["sms", "voice", "both"]);
export const heartbeatSourceEnum = pgEnum("heartbeat_source", ["pwa", "replay"]);
export const statusEnum = pgEnum("household_status", [
  "normal",
  "warning_active",
  "probable_outage",
  "countdown",
  "resolved",
]);
// h6/h2/h0 are the countdown thresholds. help and all_clear ride the same
// table so they get the same idempotency guard.
export const alertKindEnum = pgEnum("alert_kind", ["h6", "h2", "h0", "help", "all_clear"]);
export const sendChannelEnum = pgEnum("send_channel", ["sms", "voice"]);

export const households = pgTable("households", {
  id: uuid("id").primaryKey().defaultRandom(),
  label: text("label").notNull(),
  address: text("address").notNull(),
  town: text("town").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  // Resolved once at save time from lat/lng via the NWS points endpoint.
  nwsZone: text("nws_zone").notNull(),
  zoneName: text("zone_name"),
  utility: utilityEnum("utility").notNull(),
  registeredWithUtility: boolean("registered_with_utility").notNull().default(false),
  shareWithTown: boolean("share_with_town").notNull().default(false),
  // The person who lives there. Only what the risk score needs: no diagnoses.
  // A null answer means "not answered" and scores nothing either way.
  residentName: text("resident_name"),
  residentPhone: text("resident_phone"), // E.164; where the storm prompt goes
  residentChannel: contactChannelEnum("resident_channel"),
  residentBirthYear: integer("resident_birth_year"),
  livesAlone: boolean("lives_alone"),
  canLeaveUnassisted: boolean("can_leave_unassisted"),
  canReachBackup: boolean("can_reach_backup"),
  ownerUserId: text("owner_user_id"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const devices = pgTable("devices", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  type: deviceTypeEnum("type").notNull(),
  label: text("label").notNull(),
  // null = no backup at all, which the engine treats as zero runtime.
  backupHours: doublePrecision("backup_hours"),
  notes: text("notes"),
});

export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  phone: text("phone").notNull(), // always E.164
  channel: contactChannelEnum("channel").notNull(),
  priority: integer("priority").notNull(), // 1-4
  isTownVolunteer: boolean("is_town_volunteer").notNull().default(false),
  active: boolean("active").notNull().default(true), // false after STOP
});

export const heartbeats = pgTable(
  "heartbeats",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    at: ts("at").notNull(),
    batteryPct: integer("battery_pct"),
    source: heartbeatSourceEnum("source").notNull().default("pwa"),
  },
  (t) => [index("heartbeats_household_at").on(t.householdId, t.at.desc())],
);

export const householdState = pgTable("household_state", {
  householdId: uuid("household_id")
    .primaryKey()
    .references(() => households.id, { onDelete: "cascade" }),
  status: statusEnum("status").notNull().default("normal"),
  outageInferredAt: ts("outage_inferred_at"),
  countdownZeroAt: ts("countdown_zero_at"),
  lastHeartbeatAt: ts("last_heartbeat_at"),
  activeAlertId: text("active_alert_id"),
  resolvedReason: text("resolved_reason"), // heartbeat | help
  // The storm prompt sent to the resident for one warning, and their answer.
  promptAlertId: text("prompt_alert_id"),
  promptSentAt: ts("prompt_sent_at"),
  promptConfirmedAt: ts("prompt_confirmed_at"),
  promptAttempts: integer("prompt_attempts").notNull().default(0),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const alertsSent = pgTable(
  "alerts_sent",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    outageInferredAt: ts("outage_inferred_at").notNull(),
    threshold: alertKindEnum("threshold").notNull(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    channel: sendChannelEnum("channel").notNull(),
    body: text("body").notNull(),
    twilioSid: text("twilio_sid"), // null = not delivered yet, next tick retries
    attemptAt: ts("attempt_at"), // wall-clock lease so two workers can't both send
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    sentAt: ts("sent_at"),
    ackAt: ts("ack_at"),
    ackBody: text("ack_body"),
  },
  (t) => [
    // The idempotency guard: one row per incident, threshold, contact and channel.
    uniqueIndex("alerts_sent_idempotency").on(
      t.householdId,
      t.outageInferredAt,
      t.threshold,
      t.contactId,
      t.channel,
    ),
  ],
);

export const nwsAlerts = pgTable("nws_alerts", {
  id: text("id").primaryKey(), // NWS alert id
  event: text("event").notNull(),
  zones: text("zones").array().notNull(),
  onset: ts("onset").notNull(),
  expires: ts("expires").notNull(),
  severity: text("severity"),
  headline: text("headline"),
  raw: jsonb("raw").notNull(),
  fetchedAt: ts("fetched_at").notNull().defaultNow(),
  // Injected by replay mode; the poller leaves these alone when it reconciles.
  replay: boolean("replay").notNull().default(false),
});

export const replayScenarios = pgTable("replay_scenarios", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  alertJson: jsonb("alert_json").notNull(),
  heartbeatScript: jsonb("heartbeat_script").notNull(),
});

export const events = pgTable(
  "events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    householdId: uuid("household_id").references(() => households.id, { onDelete: "cascade" }),
    at: ts("at").notNull(), // app clock (simulated during replay)
    realAt: ts("real_at").notNull().defaultNow(),
    kind: text("kind").notNull(),
    message: text("message").notNull(),
    data: jsonb("data"),
  },
  (t) => [index("events_household_id").on(t.householdId, t.id.desc())],
);

// Single row (id = 1). The app clock is real time unless a replay is running.
export const appClock = pgTable("app_clock", {
  id: integer("id").primaryKey(),
  replayActive: boolean("replay_active").notNull().default(false),
  multiplier: doublePrecision("multiplier").notNull().default(1),
  anchorReal: ts("anchor_real").notNull().defaultNow(),
  anchorSim: ts("anchor_sim").notNull().defaultNow(),
  scenarioId: text("scenario_id"),
  householdId: uuid("household_id"),
  prevLastHeartbeatAt: ts("prev_last_heartbeat_at"),
});

export type Household = typeof households.$inferSelect;
export type Device = typeof devices.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type HouseholdState = typeof householdState.$inferSelect;
export type AlertSent = typeof alertsSent.$inferSelect;
export type NwsAlert = typeof nwsAlerts.$inferSelect;
export type AppClock = typeof appClock.$inferSelect;
export type Status = (typeof statusEnum.enumValues)[number];
export type AlertKind = (typeof alertKindEnum.enumValues)[number];
export type SendChannel = (typeof sendChannelEnum.enumValues)[number];
export type DeviceType = (typeof deviceTypeEnum.enumValues)[number];
export type Utility = (typeof utilityEnum.enumValues)[number];
