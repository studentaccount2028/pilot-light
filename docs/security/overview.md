# How Pilot Light protects residents' information

*For fire department and city IT staff, partners and grant reviewers. Plain-language; technical detail is in the linked documents.*

## What Pilot Light holds, and why it's sensitive

To get help to a medically dependent person during a power outage, Pilot Light keeps:

- **Where they live** and the town, so responders can find the house.
- **What keeps them alive**: the medical devices (e.g. an oxygen concentrator) and how long each battery lasts. No diagnoses are collected.
- **Who to call**: family, a neighbor, a town volunteer, and their phone numbers.
- **How to get in**: which door, where the key is, a lockbox code, a dog.

Together this is exactly what a burglar or scammer would want. The system is built so that this information is shown only to the people who need it, only when they need it, and every look at the most sensitive part is recorded.

## The protections, in plain terms

| Risk | Protection | Status |
|---|---|---|
| Someone steals the database or a backup | **Entry notes are encrypted** (AES-256-GCM) with a key kept outside the database. A stolen copy shows scrambled text; tampering is detected. | Built |
| Someone fakes "the house is fine" to hide an outage | **The house phone is paired** with a secret token; check-ins without it are rejected. | Built |
| An outsider opens the EMS board | **Staff accounts with roles**: EMS see the EMS board, a town coordinator sees only their town, families see only their own households. Roles are granted by the administrator, never self-assigned. | Built |
| A staff member's email is hacked | **Two-factor sign-in for every staff account**: a 6-digit code from an authenticator app, re-checked every 12 hours, each code usable once. Email access alone can't open the EMS board. | Built |
| Someone abuses the system quietly | **A daily security check** reads the audit log for repeated failed sign-ins, unusually heavy EMS viewing, or a responder link opened from many networks, and emails the team. It also deletes expired sessions and old records. | Built |
| A shared password leaks | The administrator key is **never accepted in a web address** (where it would land in browser history and server logs). Sign-in sets a signed cookie that expires in 12 hours and doesn't contain the key. | Built |
| Nobody can tell who saw a lockbox code | **Audit log**: every EMS view of an incident, every responder link opened during an incident, every status change, pairing, deletion and administrator sign-in is recorded with the time and who did it. | Built |
| Text messages are not secure | Texts to **town volunteers carry no medical device, address or phone number**; those are behind the volunteer's personal link, which shows details **only during an active incident**. | Built |
| Responder links are passed around | Each link is unique to one person (122-bit random), shows nothing outside an incident, and every opening is logged. Pages never send their address to other websites (`Referrer-Policy: no-referrer`). | Built |
| Password guessing and spam | **Rate limits** on every public entry point. Sign-in, administrator sign-in and authenticator codes are counted in the database, so the limit holds across all servers. | Built |
| A malicious website frames or scripts the app | Security headers on every page: HTTPS-only (HSTS), no framing, no content sniffing, a Content Security Policy (report-only, then enforced). | Built |
| Phishing through the sign-in page | Sign-in redirects only to pages on Pilot Light itself (an open-redirect bug was found and fixed). | Built |
| A family wants their data gone | **One-tap deletion** of a household and everything attached to it. | Built |
| Sessions stolen from a lost phone | Sessions expire after 30 days and sign-in is by one-time email link (no passwords to reuse). | Built |
| Forged text-message replies | Twilio webhooks are **signature-verified**; scheduled jobs require a secret. | Built (pre-existing) |

## How we know it works

- `tests/security.test.ts` checks each control directly: encryption round-trip and tamper detection, rate limits, safe redirects, the admin cookie (cannot be forged or extended), every role boundary, two-factor codes against the official RFC 6238 test values, heartbeat pairing, the content of volunteer texts, and the security headers. The full suite (57 tests) runs automatically on every push (GitHub Actions), with GitHub's CodeQL code scanner and weekly dependency updates (Dependabot).
- `scripts/e2e-security.ts` runs **38 end-to-end checks** against the real server and a real PostgreSQL database: it tries to fake heartbeats, pair a phone to someone else's house, open the EMS board without two-factor, read another town's roster, use the admin key in a URL, guess the admin key, redirect sign-in to another site, and delete someone else's household. Every attempt fails as it should, and every legitimate flow works.
- `scripts/preflight.ts` checks production settings before each deploy (keys, migrations, encryption, staff two-factor).
- A real-browser check confirms the headers are sent and the Content Security Policy reports no violations; violations from real users are collected at `/api/csp-report`.

## What's next

1. Turn on two-factor authentication on every service account (GitHub, Vercel, Twilio, database, email).
2. Enforce the Content Security Policy after a clean week of reports.
3. Move to hosting, SMS and database plans that sign a **Business Associate Agreement** (HIPAA) before holding data on a department's behalf ([vendor-checklist.md](vendor-checklist.md)).
4. An independent penetration test, and a legal review of the privacy policy.

Known limitations are listed openly in [accepted-risks.md](accepted-risks.md).
