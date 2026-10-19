# Vendor security questionnaire: Pilot Light

*Answers in the shape of a standard lightweight vendor questionnaire (SIG Lite / CAIQ Lite). "Planned" items have target dates in the pilot plan.*

**Organization**
- Who builds and runs it? A student team (Trevor Park, Jaiden Kim). AI-assisted development is disclosed in the repository.
- Security contact: see `SECURITY.md`.

**Data**
- What data do you hold? See [data-flow.md](data-flow.md). Location, entry instructions, medical device types and battery hours, contact phone numbers. No diagnoses, SSNs or payment data.
- Is data encrypted in transit? Yes, HTTPS only (HSTS, 2 years). Database connections use TLS (verify per host; see deployment checklist).
- At rest? The database host encrypts storage; entry notes are additionally encrypted at the field level (AES-256-GCM) with an application-held key.
- Where is data stored? United States (hosting and database regions to be confirmed in writing for the pilot).
- Data retention and deletion? Owner-initiated deletion of all household data; audit log retained 2 years.
- Do you sell or share data? No. Third parties receive only what their function needs (data-flow.md).

**Access control**
- Authentication: one-time email sign-in links (no passwords); staff roles granted by the administrator; administrator access by a signed 12-hour session.
- Authorization: role-based (member / coordinator / EMS / admin), checked on every API request; tested in `tests/security.test.ts`.
- MFA: email-link sign-in is single-factor for families. **Planned:** passkeys or a second factor for EMS and administrator accounts; MFA on all provider accounts now.
- Logging: audit log of sensitive views and changes (who, what, when, hashed IP).

**Application security**
- Secure development: code review, typecheck, lint and an automated test suite on every change, including security tests.
- Vulnerability management: `npm audit` reviewed; findings fixed or documented with reasoning ([accepted-risks.md](accepted-risks.md)). **Planned:** Dependabot, quarterly review.
- Penetration testing: **Planned** before the pilot holds real resident data.
- Protections: rate limiting, CSP and security headers, webhook signature verification, safe redirects, output escaping.

**Operations**
- Incident response: documented ([incident-response.md](incident-response.md)), including notification of the partner department within 24 hours of confirming an incident involving their residents.
- Backups: the managed database's automated backups; **Planned:** quarterly restore test.
- Business continuity: phones schedule their own countdown alerts so they still fire if the service or the network is down.

**Compliance**
- HIPAA: Pilot Light is consumer-directed today. Before holding data on a department's behalf it will sign a Business Associate Agreement and use BAA-covered hosting, SMS and database providers ([vendor-checklist.md](vendor-checklist.md)).
- Accessibility: **Planned** WCAG 2.1 AA review.
