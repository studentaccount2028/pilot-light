// AI-assisted: written with Claude Code from the team's build spec.
// Default backup hours per kind of device. These are starting points the
// family overrides with the real figure for their equipment; null means the
// device stops the moment the power does.
import type { DeviceType } from "../db/schema";

export interface DevicePreset {
  key: string;
  type: DeviceType;
  label: string;
  backupHours: number | null;
  help: string;
}

export const DEVICE_PRESETS: DevicePreset[] = [
  { key: "o2_stationary", type: "o2_concentrator", label: "Oxygen concentrator (stationary)", backupHours: null, help: "Stationary units have no battery. Default: no backup." },
  { key: "o2_portable", type: "o2_concentrator", label: "Oxygen concentrator (portable)", backupHours: 4, help: "Default 4 h. Check the rated battery life for your model and flow setting." },
  { key: "cpap_battery", type: "cpap", label: "CPAP / BiPAP with battery pack", backupHours: 8, help: "Default 8 h, about one night. Check your battery pack's rating." },
  { key: "cpap_none", type: "cpap", label: "CPAP / BiPAP, no battery", backupHours: null, help: "No battery pack. Default: no backup." },
  { key: "power_chair", type: "power_chair", label: "Power wheelchair", backupHours: 12, help: "Default 12 h of use on a full charge." },
  { key: "home_dialysis", type: "home_dialysis", label: "Home dialysis machine", backupHours: null, help: "Default: no backup. Follow the dialysis clinic's emergency plan." },
  { key: "fridge_meds", type: "fridge_meds", label: "Refrigerated medication (insulin)", backupHours: 24, help: "Default 24 h. This is how long a closed fridge stays cold, not a battery." },
  { key: "electric_heat", type: "electric_heat", label: "Electric heat", backupHours: null, help: "Default: no backup. Enter generator hours if there is one." },
];

export function presetByKey(key: string): DevicePreset | undefined {
  return DEVICE_PRESETS.find((p) => p.key === key);
}

export function formatHours(hours: number | null): string {
  if (hours == null || hours <= 0) return "no backup";
  return `${hours} h backup`;
}
