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
  // How a neighbor or EMS crew gets in: which door, where the key is, a dog,
  // stairs. Shown only to this household's contacts and to EMS.
  // Encrypted at rest (src/lib/security/fieldCrypto.ts).
  accessNotes: text("access_notes"),
  ownerUserId: uuid("owner_user_id"),
  // The house phone's secret (hashed), issued when it's paired. Heartbeats must present it, so no one
  // else can fake "the house is fine" and silence an outage.
  heartbeatTokenHash: text("heartbeat_token_hash"),
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
  // Where they usually are (a town or an address), for the map and the drive
  // time to the house. Optional; lat/lng are looked up from it at save.
  place: text("place"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  // The secret in this contact's responder link (/r/<key>). Unguessable, one per contact.
  linkKey: uuid("link_key").notNull().defaultRandom().unique(),
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
    // "OK 20": on the way, expected at this time. Null if no minutes were given.
    etaAt: ts("eta_at"),
    // HERE / CHECKED: reached the household in person.
    arrivedAt: ts("arrived_at"),
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

// What EMS has done about an incident, newest row wins. Families and
// neighbors see the latest status, so they know a crew is coming.
export const emsStatusEnum = pgEnum("ems_status", ["assigned", "en_route", "on_scene", "sheltered", "transported", "cleared"]);

export const emsUpdates = pgTable(
  "ems_updates",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    // The incident this belongs to; matches household_state.outage_inferred_at.
    incidentAt: ts("incident_at").notNull(),
    status: emsStatusEnum("status").notNull(),
    unit: text("unit"), // "Ossipee Rescue 2"
    note: text("note"),
    at: ts("at").notNull(), // app clock
  },
  (t) => [index("ems_updates_household").on(t.householdId, t.incidentAt, t.id.desc())],
);

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

// Login: an email, a session, and the one-time links that open sessions.
// Staff roles. "member" is a family member who runs their own households. "ems" sees the EMS board
// (every household shared with EMS); "coordinator" sees one town's roster (staffTown). Roles are
// granted by an administrator (scripts/grant-role.ts), never self-assigned.
export const userRoleEnum = pgEnum("user_role", ["member", "ems", "coordinator", "admin"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  role: userRoleEnum("role").notNull().default("member"),
  staffTown: text("staff_town"),
  // Two-factor (authenticator app), required for staff roles. Secrets are encrypted at rest.
  totpSecret: text("totp_secret"),
  totpPendingSecret: text("totp_pending_secret"),
  totpLastStep: integer("totp_last_step"), // last code used, so a code can't be replayed
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    // When this session passed the second factor. Staff access needs it within the last 12 hours.
    mfaAt: ts("mfa_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("sessions_user").on(t.userId)],
);

export const loginTokens = pgTable("login_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  email: text("email").notNull(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

// The portable power module at the house: a battery pack with a cellular
// radio that sits between the wall and the medical device. It reports wall
// power, whether its battery is charging, how much is left, and battery health.
export const sensors = pgTable(
  "sensors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    tokenHash: text("token_hash").notNull().unique(), // the module's secret, stored hashed
    createdAt: ts("created_at").notNull().defaultNow(),
    lastSeenAt: ts("last_seen_at"),
  },
  (t) => [index("sensors_household").on(t.householdId)],
);

// One report from a module. Every field but the time is optional, because
// different boards can measure different things.
export const sensorReadings = pgTable(
  "sensor_readings",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sensorId: uuid("sensor_id")
      .notNull()
      .references(() => sensors.id, { onDelete: "cascade" }),
    at: ts("at").notNull(),
    mains: boolean("mains"), // wall power present
    mainsVolts: doublePrecision("mains_volts"),
    charging: boolean("charging"), // the module's battery is taking a charge
    batteryPct: doublePrecision("battery_pct"), // state of charge, 0-100
    batteryVolts: doublePrecision("battery_volts"),
    capacityWh: doublePrecision("capacity_wh"), // usable capacity when new
    healthPct: doublePrecision("health_pct"), // state of health, 0-100
    cycles: integer("cycles"),
    outputWatts: doublePrecision("output_watts"), // power going to the medical device
    tempC: doublePrecision("temp_c"),
    signalDbm: integer("signal_dbm"),
    simulated: boolean("simulated").notNull().default(false),
  },
  (t) => [index("sensor_readings_sensor_at").on(t.sensorId, t.at.desc())],
);

export type Sensor = typeof sensors.$inferSelect;
export type SensorReading = typeof sensorReadings.$inferSelect;
export type Household = typeof households.$inferSelect;
export type Device = typeof devices.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type HouseholdState = typeof householdState.$inferSelect;
export type AlertSent = typeof alertsSent.$inferSelect;
export type NwsAlert = typeof nwsAlerts.$inferSelect;
export type AppClock = typeof appClock.$inferSelect;
export type EmsUpdate = typeof emsUpdates.$inferSelect;
export type EmsStatus = (typeof emsStatusEnum.enumValues)[number];
export type Status = (typeof statusEnum.enumValues)[number];
export type AlertKind = (typeof alertKindEnum.enumValues)[number];
export type SendChannel = (typeof sendChannelEnum.enumValues)[number];
export type DeviceType = (typeof deviceTypeEnum.enumValues)[number];
export type Utility = (typeof utilityEnum.enumValues)[number];

// Who saw or changed sensitive information, and when (src/lib/security/audit.ts). Append-only.
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    at: ts("at").notNull().defaultNow(),
    action: text("action").notNull(),
    actor: text("actor").notNull(), // "admin", "ems:<email>", "contact:<id>", "user:<email>"
    householdId: uuid("household_id"),
    detail: text("detail"),
    ipHash: text("ip_hash"),
  },
  (t) => [index("audit_household_at").on(t.householdId, t.at), index("audit_at").on(t.at)],
);

// Rate-limit counters shared by every server instance (src/lib/security/rateLimit.ts, hitShared).
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: ts("window_start").notNull(),
  count: integer("count").notNull(),
});
