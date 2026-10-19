# Production deployment checklist

## 1. Environment variables (Vercel → Project → Settings → Environment Variables)

| Variable | What | How to make it |
|---|---|---|
| `FIELD_ENCRYPTION_KEY` | Encrypts entry notes. **Required in production.** Keep a copy offline: if lost, entry notes can't be read. | `openssl rand -base64 32` |
| `ADMIN_TOKEN` | Administrator access key. **Rotate now** (the old one was shared in chat). | `openssl rand -base64 32` |
| `AUDIT_IP_SALT` | Salt for hashed IP addresses in the audit log. | `openssl rand -hex 16` |
| `CRON_SECRET` | Protects the scheduled job. | `openssl rand -hex 32` |
| `TWILIO_AUTH_TOKEN` | Required: webhooks are rejected in production without it. | Twilio console |
| `CSP_ENFORCE` | Set to `1` once a week of CSP reports (`[csp]` lines in the logs) is clean. | — |
| `SECURITY_ALERT_EMAIL` | Where the daily security check sends findings (needs `RESEND_API_KEY` and `RESEND_FROM`). | Your email |
| `DATABASE_SSL` | `require` to force an encrypted, certificate-checked database connection (or put `sslmode=require` in the URL). | — |
| `DATABASE_URL` | Must use TLS: include `sslmode=require` unless the host enforces it. | Database host |

## 2. Database
1. `npm run db:migrate` (adds staff roles, house-phone tokens and the audit log; additive only).
2. `npx tsx scripts/encrypt-existing.ts` (encrypts entry notes saved before encryption).
3. Grant staff access: `npx tsx scripts/grant-role.ts <email> ems` (or `coordinator <town>`). At first sign-in they set up an authenticator app. Lost phone: `npx tsx scripts/grant-role.ts <email> --reset-2fa`.
4. Check everything: `vercel env pull .env.production.local && npx tsx scripts/preflight.ts .env.production.local`. Deploy only when it says "Ready to deploy."
5. Optional, against a copy of the database or a test project: `BASE_URL=... npx tsx scripts/e2e-security.ts` (38 checks; creates and deletes test accounts).

## 3. After deploying
- Existing house phones re-pair themselves the next time their page is open (owned households). Check each one shows "checking in".
- Sign in to `/replay` and `/ems` with the new form (old `?key=` links no longer work).

## 4. Accounts (do today)
- Two-factor authentication on GitHub, Vercel, Twilio, the database host, Resend and the domain registrar.
- GitHub: enable secret scanning, push protection and Dependabot alerts.
- Remove anyone who no longer needs access.

## 5. Before real resident data
- Edge rate limiting (Vercel Firewall).
- BAA-covered providers (vendor-checklist.md).
- Penetration test; legal review of the privacy policy and pilot agreement.
