# Known limitations and accepted risks

Being explicit about what isn't done yet is part of being trustworthy.

| Risk | Why it's acceptable for now | Plan |
|---|---|---|
| **High-volume endpoints (heartbeats, module reports, responder links) count limits per server instance.** | Sign-in, admin sign-in and authenticator codes, where guessing matters, are counted in the database across all servers. The others are protected by long random secrets (122–256 bits); their limits only stop spam. | Vercel Firewall rules for bot traffic during the pilot. |
| **Content Security Policy is report-only.** | Blocking a missed map-tile host during an emergency is worse than a report. Real-browser checks show no violations on the main pages. | Collect reports for a week on the live site, then set `CSP_ENFORCE=1`. Later: nonce-based CSP to drop `'unsafe-inline'`. |
| **`npm audit`: MapLibre (critical, XSS in `DOM.sanitize`).** | Not reachable: Pilot Light never calls `setHTML`; every popup uses `setText`, and markers insert names as text nodes (reviewed in `HouseholdMap.tsx`). | Upgrade to MapLibre 6 after the Congressional App Challenge deadline, with map testing. |
| **`npm audit`: PostCSS (high) inside Next.js 15.** | PostCSS runs only at build time on our own stylesheets; no attacker-supplied CSS is ever processed. | Upgrade to Next.js 16 with full regression testing. |
| **`npm audit`: `uuid`/`xcode` in the Capacitor CLI (moderate).** | Developer tooling only; never shipped to users or run on the server. | Update with the next Capacitor release. |
| **Families sign in with a one-time email link (single factor).** Staff accounts require two-factor. | Email links are not reusable passwords and expire in 15 minutes; a family sees only its own household. | Passkeys (Face ID / Touch ID) for families. |
| **The administrator key is a break-glass secret without a second factor.** | It is long and random, never in URLs, rate limited in the database, every attempt is audited, and the daily check alerts on failures. | Day-to-day administration through a staff account with role `admin` (which requires two-factor); keep the key offline. |
| **The daily security check runs once a day** (Vercel Hobby cron limits). | Findings within 24 hours suit a small pilot. | Hourly on a paid plan or the long-running worker. |
| **The unowned demo household is open to anyone with its link.** | It contains only simulated data and powers the public demo. Real households are owned and require sign-in. | Keep demo data clearly marked as simulated; never put real data in an unowned household. |
| **Voice calls to volunteers still speak the device type and address.** | Calls are not stored on the phone like texts, and a volunteer at the door needs the address. | Revisit with the partner department's guidance. |
| **Addresses are sent to public OpenStreetMap geocoding and routing services.** | Only the address and coordinates, with no names or health data attached. | For a department pilot, use a geocoder under contract (see vendor checklist). |
| **Service covers New Hampshire forecast zones only.** | The app was built for NH-01. | Add California (Palo Alto) zones and PG&E outage data for the pilot. |
