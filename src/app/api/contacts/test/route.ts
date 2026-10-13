// AI-assisted: written with Claude Code from the team's build spec.
// "Send test text" on the setup form. Also how you verify Twilio works.
import { NextResponse, type NextRequest } from "next/server";
import { bad, handle } from "@/lib/http";
import { sayTwiml } from "@/lib/messages";
import { normalizePhone, placeCall, sendSms, transportMode } from "@/lib/twilio";

const lastSent = new Map<string, number>();
const TEXT = "Pilot Light test: you are listed as an emergency contact. In an outage you will get messages like this. Call 911 for any emergency.";

export const POST = handle(async (req: NextRequest) => {
  const body = await req.json();
  const phone = normalizePhone(typeof body.phone === "string" ? body.phone : "");
  if (!phone) return bad("Enter the phone number with area code, for example +1 603 555 0123.", 422);
  // One test per number per minute, so this cannot be used to spam anyone.
  const last = lastSent.get(phone) ?? 0;
  if (Date.now() - last < 60_000) return bad("A test was just sent to that number. Wait a minute and try again.", 429);
  lastSent.set(phone, Date.now());

  const voice = body.channel === "voice";
  try {
    const sid = voice ? await placeCall(phone, sayTwiml(TEXT)) : await sendSms(phone, TEXT);
    return NextResponse.json({ ok: true, sid, simulated: transportMode() === "simulated", channel: voice ? "voice" : "sms" });
  } catch (err) {
    return bad(err instanceof Error ? err.message : "Twilio rejected the message.", 502);
  }
});
