// AI-assisted: written with Claude Code from the team's build spec.
import { NextResponse, type NextRequest } from "next/server";
import { endSession, SESSION_COOKIE } from "@/lib/auth";

export async function POST(req: NextRequest) {
  await endSession(req.cookies.get(SESSION_COOKIE)?.value);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", expires: new Date(0) });
  return res;
}
