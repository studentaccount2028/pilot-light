// AI-assisted: written with Claude Code from the team's build spec.
// Twilio SMS webhook. Replies with TwiML; an empty <Response/> sends nothing.
import type { NextRequest } from "next/server";
import { handleReply, parseReply } from "@/lib/inbound";
import { publicBaseUrl, validateSignature } from "@/lib/twilio";

function twiml(message: string | null) {
  const safe = message?.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const body = safe ? `<Response><Message>${safe}</Message></Response>` : "<Response/>";
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>${body}`, { headers: { "Content-Type": "text/xml" } });
}

export async function POST(req: NextRequest) {
  const params = Object.fromEntries(new URLSearchParams(await req.text()));
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (token) {
    // Twilio signs the public URL it called, which is not the URL we see behind a tunnel.
    const url = (publicBaseUrl() ?? req.nextUrl.origin) + req.nextUrl.pathname + req.nextUrl.search;
    if (!validateSignature(token, req.headers.get("x-twilio-signature"), url, params)) {
      return new Response("Invalid signature", { status: 403 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return new Response("Twilio is not configured", { status: 503 });
  }
  if (!params.From) return twiml(null);
  try {
    return twiml(await handleReply({ fromPhone: params.From, word: parseReply(params.Body ?? ""), via: "sms" }));
  } catch (err) {
    console.error(err);
    return twiml("Pilot Light could not process that reply. Call 911 for any emergency.");
  }
}
