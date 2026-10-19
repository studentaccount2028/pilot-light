// AI-assisted: written with Claude Code from the team's security plan.
// Browsers post Content Security Policy violations here (report-only for now). The server log is the
// evidence for switching CSP_ENFORCE on: a week with no real violations means nothing will break.
import type { NextRequest } from "next/server";
import { limited } from "@/lib/security/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (limited(req, "sensorReport", "csp")) return new Response(null, { status: 204 });
  try {
    const body = (await req.json()) as Record<string, unknown> | Record<string, unknown>[];
    const reports = Array.isArray(body) ? body.map((r) => (r.body ?? r) as Record<string, unknown>) : [((body["csp-report"] ?? body) as Record<string, unknown>)];
    for (const r of reports.slice(0, 10)) {
      const directive = r["effective-directive"] ?? r.effectiveDirective ?? r["violated-directive"];
      const blocked = String(r["blocked-uri"] ?? r.blockedURL ?? "").slice(0, 200);
      const page = String(r["document-uri"] ?? r.documentURL ?? "").replace(/\/r\/[^/?#]+/, "/r/<key>").slice(0, 200);
      console.warn(`[csp] ${directive} blocked ${blocked} on ${page}`);
    }
  } catch {
    // malformed report: ignore
  }
  return new Response(null, { status: 204 });
}
