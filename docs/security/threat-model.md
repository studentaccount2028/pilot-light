# Threat model

Method: walk each way information enters or leaves the system, ask who would want to abuse it and how (STRIDE: spoofing, tampering, repudiation, information disclosure, denial of service, elevation of privilege), and name the control.

## Who might attack

| Attacker | Wants | Likely? |
|---|---|---|
| Burglar / scammer | Addresses of people who live alone, entry codes | Real: this is the highest-value target |
| Malicious insider (a volunteer, an ex-partner on a contact list) | One specific person's information | Real |
| Prankster / vandal | False alarms, silenced alarms | Possible |
| Opportunistic bot | Credential stuffing, scraping, spam | Constant background |
| Nation-state | — | Not in scope for a community pilot |

## Threats and controls

| # | Threat | STRIDE | Control | Where |
|---|---|---|---|---|
| T1 | Fake heartbeats make an outage look like normal power, so no one is alerted | Spoofing / Tampering | House phone paired with a secret token; only its hash is stored; unpaired owned households must pair | `src/lib/housePhone.ts`, `/api/heartbeat` |
| T2 | Stolen database or backup exposes entry codes | Info disclosure | Entry notes encrypted with AES-256-GCM; key held only in the hosting environment | `src/lib/security/fieldCrypto.ts` |
| T3 | Outsider reaches the EMS board or a town roster | Elevation of privilege | Role-based staff accounts; roles granted only by an admin script; every view of incidents audited | `src/lib/staff.ts`, `scripts/grant-role.ts` |
| T4 | Admin key leaks through URLs, logs or a shared screenshot | Info disclosure | Key never accepted in a URL; sign-in form sets a signed 12-hour cookie that doesn't contain the key; rotate the key on suspicion | `src/lib/admin.ts`, `/api/staff/session` |
| T5 | Responder link forwarded to the wrong person | Info disclosure | Link shows nothing outside an active incident; per-person, 122-bit random; every opening during an incident audited; `no-referrer` | `src/lib/responder.ts`, `/api/r/[key]` |
| T6 | Text message read on a lost or shared phone | Info disclosure | Volunteer texts carry no device, address or phone; family texts limited to what family already knows | `src/lib/messages.ts` |
| T7 | Forged SMS reply ("OK", "HERE") cancels escalation | Spoofing | Twilio signature verification on every webhook | `/api/twilio/inbound` |
| T8 | Guessing sign-in links, responder keys or tokens; email bombing | DoS / Spoofing | 256-bit sign-in tokens (15 min, single use); rate limits on all public entry points | `src/lib/security/rateLimit.ts` |
| T9 | Phishing via the sign-in redirect | Spoofing | Redirect target restricted to on-site paths | `src/lib/security/paths.ts` |
| T10 | Cross-site scripting injects code into a responder's page | Tampering | React escaping; map labels inserted as text only; Content Security Policy; `X-Frame-Options: DENY` | `next.config.ts`, `HouseholdMap.tsx` |
| T11 | Someone denies having viewed or changed an incident | Repudiation | Append-only audit log with actor, time, household, hashed IP | `src/lib/security/audit.ts` |
| T12 | A family member who left still has access | Elevation of privilege | Owner removes contacts; re-pairing the house phone revokes the old token; sessions expire in 30 days | Household settings |
| T13 | Data kept after a family stops using the service | Info disclosure | One-tap delete cascades to all records | `DELETE /api/households/[id]` |
| T14 | Vulnerable dependency | Tampering | `npm audit` reviewed; unreachable findings documented; Dependabot recommended | [accepted-risks.md](accepted-risks.md) |
| T15 | Outage of a provider (Twilio, hosting) during a storm | DoS | Phone schedules its own 2-hour and zero alerts offline (iOS); retries for undelivered alerts; documented in incident response | `src/lib/native.ts`, alert retries |

## Review

Re-run this model whenever a new kind of user, data or integration is added (for example, a connection to the department's dispatch system).
