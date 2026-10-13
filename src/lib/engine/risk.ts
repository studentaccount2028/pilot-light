// AI-assisted: written with Claude Code from the team's build spec.
// The risk score: how urgently one household needs a person at the door once
// the power is out. Pure and explainable: every point comes from a named
// factor, and the People tab shows the same list this function returns.
//
// It ranks who to check first. It is not a medical assessment.

export type Tier = "stable" | "check" | "check_first";
export type PromptState = "confirmed" | "no_reply" | "not_sent";

export interface RiskInput {
  residentName: string | null;
  age: number | null;
  livesAlone: boolean | null;
  canLeaveUnassisted: boolean | null;
  canReachBackup: boolean | null;
  // Shortest backup among the household's devices, in hours. 0 = none.
  backupHours: number;
  prompt: PromptState;
}

export interface Factor {
  key: string;
  label: string;
  points: number;
  state: "risk" | "ok" | "unknown";
}

export interface Risk {
  tier: Tier;
  score: number;
  factors: Factor[];
  // Short sentence for the alert text: the main reason for this tier.
  reason: string | null;
}

export const TIER_LABEL: Record<Tier, string> = { stable: "Stable", check: "Check", check_first: "Check first" };
export const TIER_RANK: Record<Tier, number> = { check_first: 0, check: 1, stable: 2 };

const CHECK_AT = 3;
const CHECK_FIRST_AT = 6;

export function ageFromBirthYear(birthYear: number | null, now: Date): number | null {
  return birthYear == null ? null : now.getUTCFullYear() - birthYear;
}

export function computeRisk(i: RiskInput): Risk {
  const who = i.residentName?.trim() || "The resident";
  const f: Factor[] = [];
  const add = (key: string, label: string, points: number, state: Factor["state"]) => f.push({ key, label, points, state });

  if (i.canLeaveUnassisted == null) add("mobility", "Can leave the house unassisted: not answered", 0, "unknown");
  else if (i.canLeaveUnassisted) add("mobility", "Can leave the house unassisted", 0, "ok");
  else add("mobility", "Cannot leave the house unassisted", 3, "risk");

  if (i.livesAlone == null) add("alone", "Lives alone: not answered", 0, "unknown");
  else if (i.livesAlone) add("alone", "Lives alone", 2, "risk");
  else add("alone", "Someone else lives there", 0, "ok");

  if (i.age == null) add("age", "Age: not answered", 0, "unknown");
  else if (i.age >= 85) add("age", `Age ${i.age}`, 2, "risk");
  else if (i.age >= 75) add("age", `Age ${i.age}`, 1, "risk");
  else add("age", `Age ${i.age}`, 0, "ok");

  if (i.backupHours <= 0) add("backup", "No backup power for at least one device", 3, "risk");
  else add("backup", `Backup power: ${i.backupHours} h on the shortest device`, 0, "ok");

  if (i.backupHours > 0) {
    if (i.canReachBackup == null) add("reach", "Knows where the backup is and can reach it: not answered", 0, "unknown");
    else if (i.canReachBackup) add("reach", "Knows where the backup is and can reach it", 0, "ok");
    else add("reach", "Cannot get to the backup without help", 2, "risk");
  }

  if (i.prompt === "confirmed") add("prompt", "Replied to the storm prompt: backup charged, plugged in and within reach", -2, "ok");
  else if (i.prompt === "no_reply") add("prompt", "No reply to the storm prompt", 2, "risk");
  else add("prompt", "No storm prompt sent for this storm", 0, "unknown");

  const score = Math.max(0, f.reduce((sum, x) => sum + x.points, 0));
  const trapped = i.canLeaveUnassisted === false && i.livesAlone === true;

  let tier: Tier = score >= CHECK_FIRST_AT ? "check_first" : score >= CHECK_AT ? "check" : "stable";
  // Two rules the points cannot override.
  if (trapped) tier = "check_first";
  if (i.prompt === "no_reply" && tier === "stable") tier = "check";

  let reason: string | null = null;
  if (trapped) reason = `${who} cannot leave the house unassisted and lives alone.`;
  else if (tier === "check_first" && i.backupHours <= 0) reason = `${who} has no backup power.`;
  else if (tier !== "stable" && i.prompt === "no_reply") reason = `${who} did not reply to the storm prompt.`;
  else if (tier !== "stable" && i.canLeaveUnassisted === false) reason = `${who} cannot leave the house unassisted.`;
  else if (tier !== "stable" && i.backupHours <= 0) reason = `${who} has no backup power.`;
  else if (tier !== "stable" && i.canReachBackup === false) reason = `${who} cannot get to the backup without help.`;
  else if (tier !== "stable" && i.livesAlone) reason = `${who} lives alone.`;
  else if (tier === "stable" && i.prompt === "confirmed") reason = `${who} replied to the storm prompt: prepared, backup within reach.`;

  return { tier, score, factors: f, reason };
}

export interface Recommended {
  name: string;
  phone: string;
  why: string;
}

// Who to contact first for each tier. It escalates with the tier:
//   stable       the first family contact, who then speaks to the resident
//   check        the resident themself, because something is unconfirmed
//   check first  911. A family member is not the answer when someone cannot
//                get out alone; the People tab adds the nearest fire/rescue
//                station and its drive time beside it.
export function recommendContact(
  tier: Tier,
  resident: { name: string | null; phone: string | null },
  contacts: { name: string; phone: string; priority: number; isTownVolunteer: boolean; active: boolean }[],
  shareWithTown: boolean,
): Recommended | null {
  const active = contacts.filter((c) => c.active).sort((a, b) => a.priority - b.priority);
  const first = active.find((c) => !c.isTownVolunteer) ?? active[0];
  const volunteer = shareWithTown ? active.find((c) => c.isTownVolunteer) : undefined;
  const who = resident.name?.trim() || "the resident";

  if (tier === "check_first") {
    return { name: "911", phone: "911", why: `Call ${who} first. If there is no answer in 10 minutes, call 911 and give the address.${volunteer ? ` ${volunteer.name} is alerted at the same time.` : ""}` };
  }
  if (tier === "check") {
    if (resident.phone) return { name: resident.name?.trim() || "The resident", phone: resident.phone, why: "Call them directly and confirm the backup is ready." };
    if (first) return { name: first.name, phone: first.phone, why: `First on the list. Ask them to reach ${who} now.` };
    return null;
  }
  if (first) return { name: first.name, phone: first.phone, why: `First on the list. They reply OK once they have spoken to ${who}.` };
  return null;
}
