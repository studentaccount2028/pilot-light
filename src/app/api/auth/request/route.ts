// AI-assisted: written with Claude Code from the team's build spec.
import { NextResponse, type NextRequest } from "next/server";
import { emailMode, normalizeEmail, requestLogin } from "@/lib/auth";
import { bad, handle } from "@/lib/http";

const recent = new Map<string, number>();

export const POST = handle(async (req: NextRequest) => {
  const body = await req.json();
  const email = normalizeEmail(body.email);
  if (!email) return bad("Enter an email address.", 422);
  // One link per address per minute.
  if (Date.now() - (recent.get(email) ?? 0) < 60_000) return bad("A link was just sent to that address. Check your email, or wait a minute.", 429);
  recent.set(email, Date.now());
  const next = typeof body.next === "string" && body.next.startsWith("/") && !body.next.startsWith("//") ? body.next : null;
  try {
    const result = await requestLogin(email, req.nextUrl.origin, next);
    return NextResponse.json({ ok: true, mode: emailMode(), ...result });
  } catch (err) {
    return bad(err instanceof Error ? err.message : "Could not send the link.", 502);
  }
});
