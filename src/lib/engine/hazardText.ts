// AI-assisted: written with Claude Code from the team's build spec.
// Reads the numbers out of an NWS winter or wind bulletin: ice accumulation,
// wind gusts, snow. A TypeScript copy of scripts/hazard-text.mjs, kept in
// step with it so a live alert gets the same features the model trained on.

const FRACTIONS: Record<string, number> = { "one tenth": 0.1, "two tenths": 0.2, "three tenths": 0.3, "a quarter": 0.25, "one quarter": 0.25, quarter: 0.25, "one half": 0.5, "a half": 0.5, half: 0.5, "three quarters": 0.75, "three quarter": 0.75, "one third": 0.33, "two thirds": 0.67 };
const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, eighteen: 18, twenty: 20, "twenty four": 24 };

function amount(s: string): number | null {
  const t = s.trim().toLowerCase().replace(/\s+of\s+an?\s+inch/, "").replace(/\s+inch(es)?/, "").trim();
  if (FRACTIONS[t] != null) return FRACTIONS[t];
  const frac = /^(\d+)\s*\/\s*(\d+)$/.exec(t);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = Number(t);
  if (Number.isFinite(n)) return n;
  if (WORDS[t] != null) return WORDS[t];
  return null;
}

const AMT = "(?:\\d+(?:\\.\\d+)?|\\d+\\s*\\/\\s*\\d+|one tenth|two tenths|three tenths|a quarter|one quarter|quarter|one half|a half|half|three quarters?|one third|two thirds|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|eighteen|twenty four|twenty)";

// The upper figure of "X to Y", "between X and Y", "up to Y", "around X".
function upper(text: string, lead: string): number | null {
  const flat = text.replace(/\s+/g, " ");
  const re = new RegExp(`${lead}[^.]*?(?:between\\s+(${AMT})\\s+and\\s+(${AMT})|(?:(?:of|around|near|about)\\s+)?(${AMT})\\s+(?:to|and)\\s+(${AMT})|(?:up to|around|of|near|as high as|possible up to|as much as)\\s+(${AMT})|(${AMT}))`, "i");
  const m = re.exec(flat);
  if (!m) return null;
  const vals = m
    .slice(1)
    .filter((g): g is string => Boolean(g))
    .map(amount)
    .filter((v): v is number => v != null);
  return vals.length ? Math.max(...vals) : null;
}

export interface HazardText {
  iceIn: number | null;
  snowIn: number | null;
  gustMph: number | null;
}

export function parseHazardText(text: string, event: string): HazardText {
  const out: HazardText = { iceIn: null, snowIn: null, gustMph: null };
  if (!text) return out;
  const ice = upper(text, "ice accumulations?");
  if (ice != null && ice <= 3) out.iceIn = ice;
  const snow = upper(text, "snow accumulations?");
  if (snow != null && snow <= 60) out.snowIn = snow;
  const gust = upper(text, "(?:winds?|gusts?)[^.]*?gust(?:s|ing)?");
  if (gust != null && gust >= 20 && gust <= 120) out.gustMph = gust;
  if (out.gustMph == null && /wind/i.test(event)) {
    const g = upper(text, "(?:gusts|gusting)");
    if (g != null && g >= 20 && g <= 120) out.gustMph = g;
  }
  return out;
}
