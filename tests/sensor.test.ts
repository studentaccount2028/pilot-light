// AI-assisted: written with Claude Code from the team's build spec.
// Power module status: what the family is told for each kind of reading.
import assert from "node:assert/strict";
import { test } from "node:test";
import { healthOf, hoursLeft, moduleStatus, replaceOf, type ReadingLike } from "../src/lib/sensorStatus";
import { parseReading } from "../src/lib/sensors";

const now = new Date("2026-01-10T12:00:00Z");
const base: ReadingLike = { at: new Date("2026-01-10T11:58:00Z"), mains: true, mainsVolts: 121, charging: true, batteryPct: 80, batteryVolts: 25.6, capacityWh: 256, healthPct: 95, cycles: 60, outputWatts: 46, tempC: 24, signalDbm: -93 };

test("charging on wall power, healthy battery", () => {
  const s = moduleStatus(base, now);
  assert.equal(s.wall, "on");
  assert.equal(s.wallText, "On · 121 V");
  assert.equal(s.chargeText, "Charging");
  assert.equal(s.replace, "good");
  assert.equal(s.signal, "fair");
  assert.deepEqual(s.warnings, []);
});

test("wall power off: on battery, and time left uses capacity, health, charge and draw", () => {
  const s = moduleStatus({ ...base, mains: false, mainsVolts: 0, charging: false }, now);
  assert.equal(s.chargeText, "On battery");
  // 256 Wh x 95% health x 80% charge / 46 W = 4.23 h
  assert.ok(Math.abs((s.hoursLeft ?? 0) - 4.23) < 0.01);
});

test("time left is unknown without capacity or with no draw", () => {
  assert.equal(hoursLeft({ ...base, capacityWh: null }), null);
  assert.equal(hoursLeft({ ...base, outputWatts: 0 }), null);
});

test("battery replacement: below 80% or 500 cycles is soon, below 70% is now", () => {
  assert.equal(replaceOf(95, 60), "good");
  assert.equal(replaceOf(79, 60), "soon");
  assert.equal(replaceOf(90, 520), "soon");
  assert.equal(replaceOf(65, 700), "now");
  assert.equal(replaceOf(null, null), "unknown");
  // Without a health figure, cycles stand in: 500 cycles is about 80%.
  assert.equal(healthOf({ healthPct: null, cycles: 500 }), 80);
  assert.equal(healthOf({ healthPct: null, cycles: 0 }), 100);
});

test("faults the family should hear about", () => {
  assert.match(moduleStatus({ ...base, charging: false, batteryPct: 60 }, now).warnings.join(" "), /not charging/);
  assert.match(moduleStatus({ ...base, mainsVolts: 98 }, now).warnings.join(" "), /98 V/);
  assert.match(moduleStatus({ ...base, tempC: 52 }, now).warnings.join(" "), /hot/);
  assert.match(moduleStatus({ ...base, mains: false, batteryPct: 12 }, now).warnings.join(" "), /below 20%/);
  const stale = moduleStatus({ ...base, at: new Date("2026-01-10T11:30:00Z") }, now);
  assert.equal(stale.reporting, false);
});

test("a full battery on the wall is Full, not a fault", () => {
  const s = moduleStatus({ ...base, charging: false, batteryPct: 100 }, now);
  assert.equal(s.chargeText, "Full");
  assert.deepEqual(s.warnings, []);
});

test("reports parse from long names or a modem's short query names", () => {
  assert.deepEqual(parseReading({ m: "1", v: "120.6", c: "0", b: "87", wh: "256", h: "94", cy: "112", w: "45", rssi: "-91", tc: "23" }), {
    mains: true, mainsVolts: 120.6, charging: false, batteryPct: 87, batteryVolts: null, capacityWh: 256, healthPct: 94, cycles: 112, outputWatts: 45, tempC: 23, signalDbm: -91,
  });
  const r = parseReading({ mains: false, battery_pct: 140, signal_dbm: 30 });
  assert.equal(r.mains, false);
  assert.equal(r.batteryPct, 100);
  assert.equal(r.signalDbm, 0);
});
