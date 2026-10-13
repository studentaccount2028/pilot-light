// AI-assisted: written with Claude Code from the team's build spec.
import { NextResponse, type NextRequest } from "next/server";
import { emailMode, userFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await userFromRequest(req);
  return NextResponse.json({ user, emailMode: emailMode() }, { headers: { "Cache-Control": "no-store" } });
}
