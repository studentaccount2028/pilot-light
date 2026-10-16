// AI-assisted: written with Claude Code from the team's build spec.
// The responder page's data, and its three buttons. The link key is the
// credential: it is the secret in this contact's alert texts.
import { NextResponse, type NextRequest } from "next/server";
import { bad, handle } from "@/lib/http";
import { handleReply } from "@/lib/inbound";
import { contactByKey, responderView } from "@/lib/responder";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ key: string }> };

export const GET = handle(async (_req: NextRequest, { params }: Ctx) => {
  const view = await responderView((await params).key);
  if (!view) return bad("This link is not valid any more. Call 911 for any emergency.", 404);
  return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
});

// Same path as a text reply: "on my way" is OK with minutes, "here" is CHECKED.
export const POST = handle(async (req: NextRequest, { params }: Ctx) => {
  const row = await contactByKey((await params).key);
  if (!row) return bad("This link is not valid any more. Call 911 for any emergency.", 404);
  const body = await req.json();
  const word = body.action === "on_way" ? "OK" : body.action === "arrived" ? "CHECKED" : body.action === "help" ? "HELP" : null;
  if (!word) return bad("Unknown action.");
  const minutes = Number(body.minutes);
  const etaMinutes = word === "OK" && Number.isInteger(minutes) && minutes >= 1 && minutes <= 480 ? minutes : null;
  const reply = await handleReply({ fromPhone: row.contact.phone, word, via: "web", etaMinutes });
  return NextResponse.json({ message: reply });
});
