# Incident response plan

**An incident** is any event that may expose, change or lose residents' information, or stop alerts from going out.

## Roles
- **Lead:** Trevor Park. **Backup:** Jaiden Kim. **Partner contact:** named in the pilot agreement.

## Steps

1. **Detect.** Sources: a vulnerability report (`SECURITY.md`), unusual audit-log activity (bulk EMS views, many failed admin sign-ins), provider alerts, or a user report.
2. **Contain (within 1 hour of confirming).**
   - Rotate whatever may be exposed: `ADMIN_TOKEN` (signs everyone out of admin), database password, Twilio auth token, `CRON_SECRET`.
   - Revoke sessions: `DELETE FROM sessions;` (everyone signs in again).
   - Demote any compromised staff account: `scripts/grant-role.ts <email> member`.
   - Re-pair affected house phones (invalidates old heartbeat tokens).
   - If entry notes may be exposed, tell affected families to **change lockbox codes** immediately.
3. **Keep alerts working.** Alerts must keep flowing during containment. If the service must go down, notify contacts by phone and tell the partner department to fall back to its normal procedures.
4. **Investigate.** Use the audit log (who saw which household, when) and provider logs to establish what was accessed.
5. **Notify.**
   - The partner department: within **24 hours** of confirming an incident involving its residents.
   - Affected families: as soon as the scope is known, in plain language, with what to do.
   - Regulators where the law requires it. California's breach law (Civ. Code §1798.82) and New Hampshire's (RSA 359-C:20) set rules and timelines; a BAA may add HIPAA breach notification. Get legal advice.
6. **Recover and learn.** Fix the root cause, add a test that would have caught it, update the threat model, and write a short public summary.

## Contact list
Kept privately with the pilot agreement: partner IT/security contact, hosting, Twilio, database and email provider support, legal advisor.
