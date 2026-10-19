// AI-assisted: written with Claude Code from the team's security plan.
// Run before every production deploy, with production's environment:
//   vercel env pull .env.production.local && npx tsx scripts/preflight.ts .env.production.local
// Prints PASS / WARN / FAIL for each check and exits non-zero on any FAIL.
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";

const envFile = process.argv[2];
if (envFile) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

type Level = "PASS" | "WARN" | "FAIL";
const results: [Level, string][] = [];
const check = (ok: boolean, level: Exclude<Level, "PASS">, msg: string, pass = msg) => results.push(ok ? ["PASS", pass] : [level, msg]);
const env = (k: string) => process.env[k] ?? "";

// Secrets
check(Buffer.from(env("FIELD_ENCRYPTION_KEY"), "base64").length === 32, "FAIL", "FIELD_ENCRYPTION_KEY must be 32 random bytes (openssl rand -base64 32)", "FIELD_ENCRYPTION_KEY set");
check(env("ADMIN_TOKEN").length >= 32 && env("ADMIN_TOKEN") !== "opensesame123", "FAIL", "ADMIN_TOKEN must be long and new (openssl rand -base64 32); the old one was shared", "ADMIN_TOKEN strong");
check(env("CRON_SECRET").length >= 32, "FAIL", "CRON_SECRET missing or short", "CRON_SECRET set");
check(Boolean(env("TWILIO_AUTH_TOKEN")), "FAIL", "TWILIO_AUTH_TOKEN missing: text replies would be rejected", "TWILIO_AUTH_TOKEN set");
check(Boolean(env("AUDIT_IP_SALT")), "WARN", "AUDIT_IP_SALT not set (IP hashes use a default salt)", "AUDIT_IP_SALT set");
check(Boolean(env("RESEND_API_KEY") && env("RESEND_FROM")), "WARN", "Email not configured: staff can't receive sign-in links", "Email configured");
check(Boolean(env("SECURITY_ALERT_EMAIL")), "WARN", "SECURITY_ALERT_EMAIL not set: security findings only go to the server log", "Security alerts emailed");
check(env("CSP_ENFORCE") === "1", "WARN", "CSP is report-only; enforce it (CSP_ENFORCE=1) after a clean week of reports", "CSP enforced");
const dbUrl = env("DATABASE_URL");
check(/sslmode=(require|verify-full|verify-ca)/.test(dbUrl) || env("DATABASE_SSL") === "require", "WARN", "Database TLS not required in config (add sslmode=require or DATABASE_SSL=require)", "Database connection encrypted");

async function main() {
  if (!dbUrl) {
    results.push(["FAIL", "DATABASE_URL missing"]);
  } else {
    const { db, closeDb } = await import("../src/db/client");
    try {
      const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as { entries: unknown[] };
      const applied = Number(((await db.execute(sql`SELECT count(*) AS n FROM drizzle.__drizzle_migrations`)).rows[0] as { n: string }).n);
      check(applied >= journal.entries.length, "FAIL", `Migrations: ${applied} of ${journal.entries.length} applied (npm run db:migrate)`, `All ${journal.entries.length} migrations applied`);
      const plain = Number(((await db.execute(sql`SELECT count(*) AS n FROM households WHERE access_notes IS NOT NULL AND access_notes NOT LIKE 'enc:v1:%'`)).rows[0] as { n: string }).n);
      check(plain === 0, "FAIL", `${plain} households have unencrypted entry notes (npx tsx scripts/encrypt-existing.ts)`, "All entry notes encrypted");
      const noMfa = Number(((await db.execute(sql`SELECT count(*) AS n FROM users WHERE role <> 'member' AND totp_secret IS NULL`)).rows[0] as { n: string }).n);
      check(noMfa === 0, "WARN", `${noMfa} staff accounts haven't set up their authenticator yet (they'll be asked at sign-in)`, "Every staff account has 2FA");
      const unowned = Number(((await db.execute(sql`SELECT count(*) AS n FROM households WHERE owner_user_id IS NULL AND id <> '00000000-0000-4000-8000-000000000001'`)).rows[0] as { n: string }).n);
      check(unowned === 0, "WARN", `${unowned} households have no owner (open to anyone with the link); real households should be owned`, "Every real household has an owner");
    } catch (err) {
      results.push(["FAIL", `Database check failed: ${err instanceof Error ? err.message : err}`]);
    } finally {
      await closeDb();
    }
  }
  for (const [level, msg] of results) console.log(`${level.padEnd(4)}  ${msg}`);
  const fails = results.filter(([l]) => l === "FAIL").length;
  console.log(`\n${fails ? `${fails} must be fixed before deploying.` : "Ready to deploy."} ${results.filter(([l]) => l === "WARN").length} warning(s).`);
  process.exit(fails ? 1 : 0);
}
main();
