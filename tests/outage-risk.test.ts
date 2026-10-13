// AI-assisted: written with Claude Code from the team's build spec.
// The bulletin parser, and that app-side inference builds the same features the trainer did.
import assert from "node:assert/strict";
import { test } from "node:test";
import model from "../src/data/outage-model.json";
import { parseHazardText } from "../src/lib/engine/hazardText";
import { outageRisk, ZONE_COUNTY } from "../src/lib/engine/outageRisk";

test("reads ice, snow and gusts out of a real NWS bulletin", () => {
  const t = "* WHAT...Heavy mixed precipitation expected. Total snow accumulations up to one inch, sleet accumulations up to one tenth of an inch, and ice accumulations between one quarter and one half of an inch. Winds gusting as high as 45 mph.";
  assert.deepEqual(parseHazardText(t, "Winter Storm Warning"), { iceIn: 0.5, snowIn: 1, gustMph: 45 });
  assert.deepEqual(parseHazardText("* WHAT...Northwest winds 20 to 30 mph with gusts up to 50 mph expected.", "Wind Advisory"), { iceIn: null, snowIn: null, gustMph: 50 });
  assert.equal(parseHazardText("* WHAT...Heavy snow. Total snow accumulations of 8 to 14 inches.", "Winter Storm Warning").snowIn, 14);
  assert.deepEqual(parseHazardText("", "Wind Advisory"), { iceIn: null, snowIn: null, gustMph: null });
});

test("every feature the model was trained on is one the app knows how to build", () => {
  const known = /^(intercept|event:.+|county:.+|duration_h\/24|month_sin|month_cos|night_onset|ice_in|ice_known|gust_mph\/10|gust_known|snow_in\/10)$/;
  for (const name of model.names) assert.match(name, known);
  assert.equal(model.names.length, model.weights.length);
  for (const county of model.counties) assert.ok(Object.values(ZONE_COUNTY).includes(county));
});

test("the forecast is only offered when the model passed validation", () => {
  const input = { event: "Winter Storm Warning", zone: "NHZ006", onset: new Date("2025-12-29T03:00:00Z"), expires: new Date("2025-12-30T00:00:00Z"), description: "ice accumulations between one quarter and one half of an inch" };
  const r = outageRisk(input);
  if (!model.shipped) {
    assert.equal(r, null);
  } else {
    assert.ok(r && r.probability > 0 && r.probability < 1);
    // A longer, icier storm is never rated safer than a short dry one.
    const calm = outageRisk({ ...input, expires: new Date("2025-12-29T06:00:00Z"), description: "" });
    assert.ok(r.probability > calm!.probability);
  }
  assert.equal(outageRisk({ ...input, zone: "CTZ010" }), null);
});
