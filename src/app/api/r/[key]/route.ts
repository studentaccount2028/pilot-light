// AI-assisted: written with Claude Code from the team's build spec.
// The responder page's data, and its three buttons. The link key is the
// credential: it is the secret in this contact's alert texts.
import { audit, auditOncePer } from "@/lib/security/audit";
import { limited } from "@/lib/security/rateLimit";
import { NextResponse, type NextRequest } from "next/server";
import { bad, handle } from "@/lib/http";
import { handleReply } from "@/lib/inbound";
import { contactByKey, responderView } from "@/lib/responder";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ key: string }> };

export const GET = handle(async (req: NextRequest, { params }: Ctx) => {
  const slow = limited(req, "responderLink");
  if (slow) return slow;
  const key = (await params).key;
  const view = await responderView(key);
  if (!view) return bad("This link is not valid any more. Call 911 for any emergency.", 404);
  // During an incident this page shows the address, phone and entry notes: record who opened it.
  if (view.active) {
    const row = await contactByKey(key); // server-side only: the household id is never sent to the responder
    await auditOncePer(req, key, { action: "responder.link_opened", actor: `contact:${view.me.id}`, householdId: row?.household.id ?? null });
  }
  return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
});

// Same path as a text reply: "on my way" is OK with minutes, "here" is CHECKED.
export const POST = handle(async (req: NextRequest, { params }: Ctx) => {
  const slow = limited(req, "responderLink");
  if (slow) return slow;
  const row = await contactByKey((await params).key);
  if (!row) return bad("This link is not valid any more. Call 911 for any emergency.", 404);
  const body = await req.json();
  const word = body.action === "on_way" ? "OK" : body.action === "arrived" ? "CHECKED" : body.action === "help" ? "HELP" : null;
  if (!word) return bad("Unknown action.");
  const minutes = Number(body.minutes);
  const etaMinutes = word === "OK" && Number.isInteger(minutes) && minutes >= 1 && minutes <= 480 ? minutes : null;
  const reply = await handleReply({ fromPhone: row.contact.phone, word, via: "web", etaMinutes });
  await audit(req, { action: "responder.action", actor: `contact:${row.contact.id}`, householdId: row.household.id, detail: word });
  return NextResponse.json({ message: reply });
});
