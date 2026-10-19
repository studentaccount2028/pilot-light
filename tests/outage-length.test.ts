// AI-assisted: written with Claude Code from the team's forecast spec.
// The app's outage-length model gives the same answers as the Python it was trained in,
// and builds the same features.
import assert from "node:assert/strict";
import { test } from "node:test";
import model from "../src/data/outage-length-model.json";
import { lengthFeatures, predictHours, race } from "../src/lib/engine/outageLength";

test("the TypeScript tree walk matches XGBoost on every exported fixture", () => {
  for (const fx of model.fixtures) {
    const x = model.features.map((name) => (fx.features as Record<string, number | null>)[name]);
    const got = predictHours(x);
    assert.ok(Math.abs(got - fx.expectedHours) / fx.expectedHours < 1e-4, `${got} vs ${fx.expectedHours}`);
  }
});

test("the app builds every feature the model was trained on", () => {
  const f = lengthFeatures({
    event: "Winter Storm Warning", zone: "NHZ006", onset: new Date("2025-12-29T03:00:00Z"), expires: new Date("2025-12-30T00:00:00Z"),
    description: "ice accumulations between one quarter and one half of an inch. Winds gusting as high as 45 mph.",
    outageStart: new Date("2025-12-29T05:09:00Z"), shareOutAtStart: 0.03, shareOutAt1h: 0.12,
  });
  for (const name of model.features) assert.ok(name in f, `missing ${name}`);
  assert.equal(f.ev_winter_storm, 1);
  assert.equal(f.duration_hours, 21);
  assert.equal(f.fc_iceIn, 0.5);
  assert.ok(Math.abs((f.o_growth_1h as number) - 0.09) < 1e-9);
});

test("the race: a faster-spreading outage is predicted longer, and the odds track the battery", () => {
  const base = {
    event: "Winter Storm Warning", zone: "NHZ006", onset: new Date("2025-12-29T03:00:00Z"), expires: new Date("2025-12-30T00:00:00Z"),
    description: "ice accumulations up to one half of an inch", outageStart: new Date("2025-12-29T05:00:00Z"),
  };
  const slow = race({ ...base, shareOutAtStart: 0.02, shareOutAt1h: 0.025 }, 4)!;
  const fast = race({ ...base, shareOutAtStart: 0.02, shareOutAt1h: 0.2 }, 4)!;
  assert.ok(fast.predictedHours > slow.predictedHours, `${fast.predictedHours} vs ${slow.predictedHours}`);
  assert.ok(fast.low < fast.predictedHours && fast.predictedHours < fast.high);
  const longBattery = race({ ...base, shareOutAtStart: 0.02, shareOutAt1h: 0.2 }, 24)!;
  assert.ok(longBattery.pDarkOverBattery < fast.pDarkOverBattery);
  assert.equal(race({ ...base, zone: "MAZ001", shareOutAtStart: 0, shareOutAt1h: 0 }, 4), null);
});
