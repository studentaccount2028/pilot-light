// AI-assisted: written with Claude Code from the team's security plan.
// Daily security housekeeping, run by the scheduled job (/api/cron/tick):
//   - retention: audit log 2 years; expired sessions, used or expired sign-in links, old rate-limit rows
//   - watch: look at the last day of the audit log for patterns that need a human, and email them
//     to SECURITY_ALERT_EMAIL (or log them if email isn't configured)
import { sql } from "drizzle-orm";
import { db } from "../../db/client";

export interface Finding {
  what: string;
  count: number;
}

export async function securityMaintenance(now = new Date()): Promise<{ purged: Record<string, number>; findings: Finding[] }> {
  const purged: Record<string, number> = {};
  const run = async (name: string, q: ReturnType<typeof sql>) => {
    const r = await db.execute(q);
    purged[name] = r.rowCount ?? 0;
  };
  await run("audit_log", sql`DELETE FROM audit_log WHERE at < ${now}::timestamptz - interval '730 days'`);
  await run("sessions", sql`DELETE FROM sessions WHERE expires_at < ${now}`);
  await run("login_tokens", sql`DELETE FROM login_tokens WHERE expires_at < ${now} OR used_at IS NOT NULL`);
  await run("rate_limits", sql`DELETE FROM rate_limits WHERE window_start < ${now}::timestamptz - interval '1 day'`);

  const findings: Finding[] = [];
  const count = async (q: ReturnType<typeof sql>) => Number(((await db.execute(q)).rows[0] as { n: string | number }).n);
  const day = sql`at > ${now}::timestamptz - interval '1 day'`;
  const failedAdmin = await count(sql`SELECT count(*) AS n FROM audit_log WHERE action = 'staff.sign_in_failed' AND ${day}`);
  if (failedAdmin >= 5) findings.push({ what: "failed administrator sign-ins in the last day", count: failedAdmin });
  const failedMfa = await count(sql`SELECT count(*) AS n FROM audit_log WHERE action = 'staff.mfa_failed' AND ${day}`);
  if (failedMfa >= 5) findings.push({ what: "failed authenticator codes in the last day", count: failedMfa });
  const heavy = await count(sql`SELECT coalesce(max(c), 0) AS n FROM (SELECT count(*) AS c FROM audit_log WHERE action = 'ems.board_viewed' AND ${day} GROUP BY actor) t`);
  if (heavy >= 100) findings.push({ what: "EMS board views by a single account in the last day (unusually high)", count: heavy });
  const spread = await count(sql`SELECT coalesce(max(c), 0) AS n FROM (SELECT count(DISTINCT ip_hash) AS c FROM audit_log WHERE action = 'responder.link_opened' AND ${day} GROUP BY actor) t`);
  if (spread >= 4) findings.push({ what: "different networks opening one person's responder link in the last day (the link may have been forwarded)", count: spread });

  if (findings.length) await notify(findings);
  return { purged, findings };
}

async function notify(findings: Finding[]) {
  const text = `Pilot Light security check found:\n\n${findings.map((f) => `- ${f.count} ${f.what}`).join("\n")}\n\nReview the audit log (docs/security/incident-response.md).`;
  const to = process.env.SECURITY_ALERT_EMAIL;
  if (to && process.env.RESEND_API_KEY && process.env.RESEND_FROM) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.RESEND_FROM, to: [to], subject: "Pilot Light security check", text }),
      signal: AbortSignal.timeout(15_000),
    }).catch((err) => console.error("[security] alert email failed", err));
  } else {
    console.error(`[security] ${text}`);
  }
}
