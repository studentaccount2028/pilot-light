# Vendors for a department pilot

When Pilot Light holds information **on behalf of** a fire department that is a HIPAA-covered entity (most EMS agencies are), it becomes a *business associate*. It must sign a Business Associate Agreement (BAA) with the department, and every service that touches that information must sign one with Pilot Light. **Plans and prices change: confirm each item directly with the vendor.**

| Service | Today | What to check for the pilot |
|---|---|---|
| Hosting (Vercel) | Hobby/Pro | Whether a BAA is offered and on which plan; otherwise a HIPAA-eligible host (e.g. AWS, Google Cloud or Azure under their BAA, or a HIPAA-focused platform). |
| Database (PostgreSQL) | Managed host | A plan with a BAA, encryption at rest, point-in-time recovery, US region. |
| SMS and voice (Twilio) | Standard | Twilio's HIPAA-eligible products and BAA terms; keep message content minimal regardless. |
| Email (Resend) | Sign-in links only | Sign-in emails contain no health data; confirm whether a BAA is needed with counsel. |
| Geocoding / routing (OpenStreetMap services) | Public servers | A contracted or self-hosted geocoder so addresses don't go to public servers. |
| Map tiles (OpenFreeMap) | Public | Tiles carry no personal data (the browser requests map areas, not households). |

Also: California's Confidentiality of Medical Information Act may apply to apps that maintain medical information for consumers. Ask counsel (a university law clinic is a good free option).
