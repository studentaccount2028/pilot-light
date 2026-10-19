// AI-assisted: written with Claude Code from the team's build spec.
// Every alert is a plain SMS or a text-to-speech phone call. Voice reads the
// same words, with key presses in place of reply words.
import type { Tier } from "./engine/risk";
import type { Threshold } from "./engine/rules";

export interface MessageContext {
  label: string;
  town: string;
  address: string;
  deviceLabel: string;
  remainingMs: number;
  // Risk tier and the sentence that explains it, e.g. "Mom lives alone."
  tier?: Tier;
  reason?: string | null;
  residentName?: string | null;
  residentPhone?: string | null;
}

// "about 3.5 hours", "about 40 minutes". The message states what is actually
// left, which is less than the threshold name when an outage is inferred late.
export function formatRemaining(ms: number): string {
  if (ms <= 0) return "no time";
  const minutes = ms / 60_000;
  if (minutes < 60) return `about ${Math.max(5, Math.round(minutes / 5) * 5)} minutes`;
  const halves = Math.round(minutes / 30) / 2;
  return `about ${halves} ${halves === 1 ? "hour" : "hours"}`;
}

// The first line changes with the risk tier:
//   stable       what is known, and "reply OK when you've spoken to them"
//   check        the reason, and "please call now"
//   check first  911 guidance leads, before anything else
// The responder page for this contact, when a public URL is configured.
function detailsLine(link: string | null | undefined): string {
  return link ? ` What to do: ${link}` : "";
}

export function thresholdSms(threshold: Threshold, ctx: MessageContext, opts: { volunteer: boolean; link?: string | null }): string {
  const tier = ctx.tier ?? "stable";
  const reason = ctx.reason ? ` ${ctx.reason}` : "";
  // Texts aren't encrypted and stay on phones. Family already knows the house; a town volunteer gets
  // the minimum: no medical device by name, and the address and phone only behind their secure link
  // (which shows details only during an incident). Without a link, they still need the address.
  const minimal = opts.volunteer && Boolean(opts.link);
  ctx = opts.volunteer ? { ...ctx, deviceLabel: "the medical equipment" } : ctx;
  const who = minimal ? "the resident" : ctx.residentName?.trim() || "them";
  const reach = opts.volunteer && !minimal ? ` Address: ${ctx.address}.${ctx.residentPhone ? ` Phone: ${ctx.residentPhone}.` : ""}` : "";
  const replies = opts.volunteer
    ? "Reply OK and your minutes away if you're heading there (OK 20), CHECKED once you have checked in person, HELP if help is needed."
    : "Reply OK once you've seen this, with your minutes away if you're going (OK 20), HERE when you arrive, HELP if help is needed.";

  const details = detailsLine(opts.link);
  if (threshold === "h0") {
    return `PILOT LIGHT: Backup power for ${ctx.deviceLabel} at ${ctx.label}, ${ctx.town} has likely run out. If you cannot reach ${who}, call 911 now.${reach} ${replies}${details}`;
  }
  const left = `${ctx.deviceLabel} has ${formatRemaining(ctx.remainingMs)} of backup.`;
  if (tier === "check_first") {
    return `PILOT LIGHT: Call ${who} now; if no answer in 10 minutes, call 911. Power appears out at ${ctx.label}, ${ctx.town}.${reason} ${left}${reach} Reply HELP to alert everyone immediately.${details}`;
  }
  if (tier === "check") {
    return `PILOT LIGHT: Power appears out at ${ctx.label}, ${ctx.town}.${reason} Please call ${who} now. ${left}${reach} ${replies} Call 911 for any emergency.${details}`;
  }
  const urgent = threshold === "h2" ? " Please check now." : "";
  return `PILOT LIGHT: Power appears out at ${ctx.label}, ${ctx.town}.${reason} ${left}${urgent}${reach} ${replies} Call 911 for any emergency.${details}`;
}

export function thresholdVoice(threshold: Threshold, ctx: MessageContext, opts: { volunteer: boolean }): string {
  const who = ctx.residentName?.trim() || "them";
  const tier = ctx.tier ?? "stable";
  const reason = ctx.reason ? ` ${ctx.reason}` : "";
  const where = opts.volunteer ? ` The address is ${ctx.address}.` : "";
  if (threshold === "h0") {
    return `This is Pilot Light. Backup power for ${ctx.deviceLabel} at ${ctx.label}, in ${ctx.town}, has likely run out.${where} If you cannot reach ${who}, call 9 1 1 now.`;
  }
  const left = `${ctx.deviceLabel} has ${formatRemaining(ctx.remainingMs)} of backup.`;
  if (tier === "check_first") {
    return `This is Pilot Light. Call ${who} now. If there is no answer in 10 minutes, call 9 1 1. Power appears to be out at ${ctx.label}, in ${ctx.town}.${reason} ${left}${where}`;
  }
  const ask = tier === "check" ? ` Please call ${who} now.` : threshold === "h2" ? " Please check now." : "";
  return `This is Pilot Light. Power appears to be out at ${ctx.label}, in ${ctx.town}.${reason} ${left}${ask}${where} Call 9 1 1 for any emergency.`;
}

// Sent to the resident when a storm warning starts. Their YES is what lets
// the family's alert say "confirmed prepared".
export function stormPromptSms(event: string): string {
  return `PILOT LIGHT: A ${event} is in effect for your area. Is your backup charged, plugged in and within reach? Reply YES if ready, HELP if you need help.`;
}

export function stormPromptTwiml(event: string, gatherUrl: string | null): string {
  const say = `<Say voice="alice">${xml(`This is Pilot Light. A ${event} is in effect for your area. Is your backup charged, plugged in and within reach?`)}</Say>`;
  if (!gatherUrl) return `<?xml version="1.0" encoding="UTF-8"?><Response>${say}</Response>`;
  const prompt = `<Say voice="alice">Press 1 if you are ready. Press 2 if you need help.</Say>`;
  const gather = `<Gather numDigits="1" timeout="8" method="POST" action="${xml(gatherUrl)}">${say}${prompt}</Gather>`;
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${gather}${gather}<Say voice="alice">No key pressed. Goodbye.</Say></Response>`;
}

export function allClearText(label: string): string {
  return `PILOT LIGHT: All clear: ${label} is back in contact.`;
}

export function helpCascadeText(reporter: string, label: string, address: string, link?: string | null): string {
  return `PILOT LIGHT: ${reporter} reports ${label} needs help. Address: ${address}. If you are nearby go now and reply OK with your minutes away (OK 15); otherwise call 911.${detailsLine(link)}`;
}

export const REPLY_HELP_TEXT = "Pilot Light: reply OK once you've seen the alert (OK 20 if you're 20 minutes away), HERE when you arrive, HELP if they need assistance. Call 911 for any emergency.";

function xml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// TwiML for an outbound call. With a gather URL the listener can press
// 1 = OK or 2 = HELP; without one (no public URL configured) it only speaks.
export function voiceTwiml(spoken: string, gatherUrl: string | null): string {
  const say = `<Say voice="alice">${xml(spoken)}</Say>`;
  if (!gatherUrl) {
    return `<?xml version="1.0" encoding="UTF-8"?><Response>${say}<Pause length="1"/>${say}</Response>`;
  }
  const prompt = `<Say voice="alice">Press 1 if you have seen this and are handling it. Press 2 if they need help.</Say>`;
  return (
    `<?xml version="1.0" encoding="UTF-8"?><Response>` +
    `<Gather numDigits="1" timeout="6" method="POST" action="${xml(gatherUrl)}">${say}${prompt}</Gather>` +
    `<Gather numDigits="1" timeout="6" method="POST" action="${xml(gatherUrl)}">${say}${prompt}</Gather>` +
    `<Say voice="alice">No key pressed. Goodbye.</Say></Response>`
  );
}

export function sayTwiml(spoken: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">${xml(spoken)}</Say></Response>`;
}
