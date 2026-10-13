// AI-assisted: written with Claude Code from the team's build spec.
// Gathers the inputs to the risk score from database rows.
import type { Device, Household, HouseholdState } from "../db/schema";
import { ageFromBirthYear, computeRisk, type PromptState, type Risk } from "./engine/risk";
import { limitingDevice } from "./engine/rules";

// A prompt only counts for the storm it was sent for.
export function promptState(state: Pick<HouseholdState, "promptAlertId" | "promptConfirmedAt"> | null | undefined, alertId: string | null | undefined): PromptState {
  if (!state?.promptAlertId || !alertId || state.promptAlertId !== alertId) return "not_sent";
  return state.promptConfirmedAt ? "confirmed" : "no_reply";
}

export function riskFor(household: Household, state: HouseholdState | null | undefined, devices: Device[], alertId: string | null | undefined, now: Date): Risk & { prompt: PromptState } {
  const prompt = promptState(state, alertId);
  const risk = computeRisk({
    residentName: household.residentName,
    age: ageFromBirthYear(household.residentBirthYear, now),
    livesAlone: household.livesAlone,
    canLeaveUnassisted: household.canLeaveUnassisted,
    canReachBackup: household.canReachBackup,
    backupHours: limitingDevice(devices).hours,
    prompt,
  });
  return { ...risk, prompt };
}
