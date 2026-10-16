// AI-assisted: written with Claude Code from the team's build spec.
// Twilio over plain HTTPS: outbound SMS, outbound voice, webhook signature
// check. With no credentials the transport is "simulated": nothing leaves the
// machine and every send is labelled SIMULATED in the event log.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type TransportMode = "twilio" | "simulated";

export function transportMode(): TransportMode {
  if (process.env.TWILIO_DRY_RUN === "1") return "simulated";
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM } = process.env;
  return TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM ? "twilio" : "simulated";
}

export function publicBaseUrl(): string | null {
  const url = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "");
  return url || null;
}

// The responder page a contact's texts link to, or null without a public URL.
export function responderLink(linkKey: string): string | null {
  const base = publicBaseUrl();
  return base ? `${base}/r/${linkKey}` : null;
}

export { isE164, normalizePhone } from "./phone";

async function twilioPost(resource: "Messages" | "Calls", form: Record<string, string>): Promise<string> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/${resource}.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(form),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string; code?: number };
  if (!res.ok || !json.sid) {
    throw new Error(`Twilio ${resource} failed (${res.status}): ${json.message ?? "no message"}${json.code ? ` [${json.code}]` : ""}`);
  }
  return json.sid;
}

function simulatedSid(): string {
  return "SIMULATED-" + randomBytes(6).toString("hex");
}

export async function sendSms(to: string, body: string): Promise<string> {
  if (transportMode() === "simulated") return simulatedSid();
  return twilioPost("Messages", { To: to, From: process.env.TWILIO_FROM!, Body: body });
}

export async function placeCall(to: string, twiml: string): Promise<string> {
  if (transportMode() === "simulated") return simulatedSid();
  return twilioPost("Calls", { To: to, From: process.env.TWILIO_FROM!, Twiml: twiml });
}

// Twilio signs each webhook: base64(HMAC-SHA1(authToken, url + sorted key/value pairs)).
export function expectedSignature(authToken: string, url: string, params: Record<string, string>): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");
}

export function validateSignature(authToken: string, signature: string | null, url: string, params: Record<string, string>): boolean {
  if (!signature) return false;
  const expected = Buffer.from(expectedSignature(authToken, url, params));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
