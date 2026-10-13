// AI-assisted: written with Claude Code from the team's build spec.
// Key press on a voice alert: 1 = OK, 2 = HELP. Same handlers as SMS replies.
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { alertsSent, contacts } from "@/db/schema";
import { isUuid } from "@/lib/households";
import { eq as eqHousehold } from "drizzle-orm";
import { households } from "@/db/schema";
import { getClock, simNow } from "@/lib/clock";
import { handleReply, handleResidentReply, parseDigit } from "@/lib/inbound";
import { sayTwiml } from "@/lib/messages";
import { publicBaseUrl, validateSignature } from "@/lib/twilio";

const xml = (body: string) => new Response(body, { headers: { "Content-Type": "text/xml" } });

export async function POST(req: NextRequest) {
  const params = Object.fromEntries(new URLSearchParams(await req.text()));
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (token) {
    const url = (publicBaseUrl() ?? req.nextUrl.origin) + req.nextUrl.pathname + req.nextUrl.search;
    if (!validateSignature(token, req.headers.get("x-twilio-signature"), url, params)) {
      return new Response("Invalid signature", { status: 403 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return new Response("Twilio is not configured", { status: 503 });
  }

  // The alert id in the URL tells us who we called; on an outbound call the
  // contact is the "To" side, so From cannot be used.
  const word = parseDigit(params.Digits ?? "");
  // A key press on the storm prompt call to the resident.
  const promptHousehold = req.nextUrl.searchParams.get("prompt");
  if (isUuid(promptHousehold)) {
    try {
      const [home] = await db.select({ phone: households.residentPhone }).from(households).where(eqHousehold(households.id, promptHousehold));
      if (!home?.phone || word === "OTHER") return xml(sayTwiml("Sorry, that key is not an option. Call 9 1 1 for any emergency. Goodbye."));
      const reply = await handleResidentReply(home.phone, word, "voice", simNow(await getClock()), promptHousehold);
      return xml(sayTwiml((reply ?? "Thank you.").replace("Pilot Light: ", "").replace(/911/g, "9 1 1") + " Goodbye."));
    } catch (err) {
      console.error(err);
      return xml(sayTwiml("Pilot Light could not record that. Call 9 1 1 for any emergency. Goodbye."));
    }
  }

  const alertId = req.nextUrl.searchParams.get("alert");
  if (!isUuid(alertId) || word === "OTHER") {
    return xml(sayTwiml("Sorry, that key is not an option. Call 9 1 1 for any emergency. Goodbye."));
  }
  try {
    const [row] = await db
      .select({ phone: contacts.phone })
      .from(alertsSent)
      .innerJoin(contacts, eq(contacts.id, alertsSent.contactId))
      .where(eq(alertsSent.id, alertId));
    if (!row) return xml(sayTwiml("This alert is no longer active. Call 9 1 1 for any emergency. Goodbye."));
    const reply = await handleReply({ fromPhone: row.phone, word, via: "voice" });
    return xml(sayTwiml((reply ?? "Thank you.").replace("911", "9 1 1") + " Goodbye."));
  } catch (err) {
    console.error(err);
    return xml(sayTwiml("Pilot Light could not record that. Call 9 1 1 for any emergency. Goodbye."));
  }
}
