// AI-assisted: written with Claude Code from the team's build spec.
// Shapes of the JSON the API returns (dates arrive as ISO strings).
export type Status = "normal" | "warning_active" | "probable_outage" | "countdown" | "resolved";
export type Channel = "sms" | "voice" | "both";

export interface HouseholdDto {
  id: string;
  label: string;
  address: string;
  town: string;
  lat: number;
  lng: number;
  nwsZone: string;
  zoneName: string | null;
  utility: "eversource" | "unitil" | "liberty" | "nhec" | "other";
  registeredWithUtility: boolean;
  shareWithTown: boolean;
  residentName: string | null;
  residentPhone: string | null;
  residentChannel: Channel | null;
  residentAge: number | null;
  livesAlone: boolean | null;
  canLeaveUnassisted: boolean | null;
  canReachBackup: boolean | null;
}

export type Tier = "stable" | "check" | "check_first";

export interface RiskDto {
  tier: Tier;
  score: number;
  factors: { key: string; label: string; points: number; state: "risk" | "ok" | "unknown" }[];
  reason: string | null;
  prompt: "confirmed" | "no_reply" | "not_sent";
  promptSentAt: string | null;
  recommended: { name: string; phone: string; why: string } | null;
}

export interface DeviceDto {
  id: string;
  type: string;
  label: string;
  backupHours: number | null;
  notes: string | null;
}

export interface ContactDto {
  id: string;
  name: string;
  phone: string;
  channel: Channel;
  priority: number;
  isTownVolunteer: boolean;
  active: boolean;
}

export interface AlertDto {
  id: string;
  contactId: string;
  threshold: "h6" | "h2" | "h0" | "help" | "all_clear";
  channel: "sms" | "voice";
  sid: string | null;
  sentAt: string | null;
  ackAt: string | null;
  ackBody: string | null;
  lastError: string | null;
}

export interface EventDto {
  id: number;
  at: string;
  kind: string;
  message: string;
}

export interface ClockDto {
  now: string;
  multiplier: number;
  replayActive: boolean;
  replayHouseholdId: string | null;
}

export interface StatusDto {
  household: HouseholdDto;
  devices: DeviceDto[];
  contacts: ContactDto[];
  state: {
    status: Status;
    outageInferredAt: string | null;
    countdownZeroAt: string | null;
    lastHeartbeatAt: string | null;
    resolvedReason: string | null;
  } | null;
  warning: { id: string; event: string; headline: string | null; onset: string; expires: string; replay: boolean; raw: unknown } | null;
  alerts: AlertDto[];
  events: EventDto[];
  limitingDeviceId: string | null;
  limitingHours: number;
  resident: { name: string | null; phone: string | null; age: number | null };
  risk: RiskDto;
  clock: ClockDto;
  transport: "twilio" | "simulated";
}

export interface NearbySiteDto {
  kind: "fire" | "police" | "hospital";
  name: string;
  city: string;
  lat: number;
  lng: number;
  miles: number;
  minutes: number;
  estimated: boolean;
}
