// AI-assisted: written with Claude Code from the team's build spec.
// What a neighbor or volunteer should do when they get the alert, as plain
// steps. Practical safety guidance only: no diagnosis, nothing that replaces
// 911. Every list ends with when to call 911. Pure, so it can be tested.
import type { DeviceType } from "../db/schema";
import type { Tier } from "./engine/risk";

export interface Step {
  title: string;
  detail: string;
  urgent?: boolean;
}

export interface GuidanceInput {
  residentName: string | null;
  residentPhone: string | null;
  address: string;
  devices: { type: DeviceType; label: string }[];
  remainingMs: number | null; // null when not counting down
  helpRequested: boolean;
  tier: Tier;
  livesAlone: boolean | null;
  canLeaveUnassisted: boolean | null;
  accessNotes: string | null;
}

const TWO_HOURS = 2 * 3_600_000;

// Once inside: what to check for each kind of device.
const DEVICE_STEPS: Record<DeviceType, Step> = {
  o2_concentrator: {
    title: "Oxygen: switch to a tank",
    detail:
      "A concentrator stops when its battery runs out. If they have oxygen tanks, help them switch over and read the gauge so you know how long it lasts. Keep oxygen well away from candles, stoves, cigarettes and generators.",
  },
  cpap: {
    title: "CPAP: plan for tonight",
    detail: "Ask whether they can manage without it until power is back, or need somewhere with power to sleep. Never run it from a generator indoors.",
  },
  power_chair: {
    title: "Power chair: check the charge",
    detail:
      "If the chair is low, plan the move before it runs out: they may not be able to get out once it does. Do not try to carry someone down stairs alone. The fire department's non-emergency line can send a lift assist.",
  },
  home_dialysis: {
    title: "Home dialysis: call their center",
    detail: "The machine cannot run without power. Ask when their next treatment is due and help them call their dialysis center, which has an emergency plan for outages.",
  },
  fridge_meds: {
    title: "Cold medicine: keep it cool",
    detail: "Move refrigerated medicine, such as insulin, into a cooler with ice packs. Don't let it touch the ice or freeze, and don't leave it outside in the cold.",
  },
  electric_heat: {
    title: "Heat: check how cold the house is",
    detail:
      "If it's below about 60°F inside, help them get warm with layers and blankets, or move somewhere heated. Never use a stove, oven, grill or generator indoors for heat.",
  },
};

function dedupe<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

export function guidanceFor(i: GuidanceInput): Step[] {
  const who = i.residentName?.trim() || "them";
  const steps: Step[] = [];
  const low = i.helpRequested || (i.remainingMs != null && i.remainingMs <= TWO_HOURS);
  const out = i.remainingMs != null && i.remainingMs <= 0;

  if (i.helpRequested) {
    steps.push({
      title: "Help was requested",
      detail: `Someone asked for help. If you are close, go now. If you can't get there quickly, call 911 and give the address: ${i.address}.`,
      urgent: true,
    });
  }

  steps.push({
    title: `Call ${who} first`,
    detail: i.residentPhone
      ? `Call ${i.residentPhone}. If there's no answer after two tries${low ? "" : " and the backup is under 2 hours"}, call 911.`
      : `There is no phone on file for ${who}. Go to the house, or call 911 if you can't get there${low ? " now" : " before the backup runs out"}.`,
    urgent: out || i.tier === "check_first",
  });

  steps.push({
    title: "Getting in",
    detail: i.accessNotes?.trim() ? i.accessNotes.trim() : "Knock and call out. No entry notes were left for this house.",
  });

  // One step per kind of device, in the order listed.
  for (const type of dedupe(i.devices.map((d) => d.type))) steps.push(DEVICE_STEPS[type]);

  const leave =
    i.canLeaveUnassisted === false
      ? `${who} may not be able to leave without help. Don't move them on your own if it isn't safe; call 911 or the fire department.`
      : `Help ${who} go to family, a friend or a warming center with power. Dial 2-1-1 for open shelters in New Hampshire.`;
  steps.push({
    title: out ? "Backup is likely out: move them to power" : "If the power won't be back in time",
    detail: leave,
    urgent: out,
  });

  steps.push({
    title: "Generators go outside",
    detail: "Only ever run a generator outdoors, at least 20 feet from doors and windows. Carbon monoxide has no smell.",
  });

  if (i.livesAlone) {
    steps.push({ title: "Don't leave them alone without a plan", detail: `${who} lives alone. Before you leave, make sure someone will check again or that they are going somewhere with power.` });
  }

  steps.push({
    title: "Call 911 right away if",
    detail: "they are short of breath, confused, very drowsy or hard to wake, have blue lips, chest pain, have fallen, or you can't reach them and the backup is out.",
    urgent: true,
  });
  return steps;
}
