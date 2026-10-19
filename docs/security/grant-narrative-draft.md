# Grant narrative (DRAFT)

*Adapt to each funder's questions and limits. Facts to verify before submitting are marked [verify].*

## The problem
People who depend on powered medical equipment (oxygen concentrators, ventilators, powered wheelchairs) are in danger when the power fails. Utilities keep medical-baseline lists but generally only promise to *try* to notify them. In California, planned Public Safety Power Shutoffs deliberately cut power in wildfire weather; in New Hampshire, winter storms do the same unplanned. When no one notices that a person living alone has lost power, a battery that lasts four hours becomes the whole margin of safety.

## The solution
Pilot Light notices the outage without the resident pressing anything (a phone or a small power module at the home stops checking in during a storm warning), counts down the shortest backup battery, and alerts family, a neighbor, a town volunteer and, with consent, EMS, in order, before time runs out. EMS see who is at risk, how much time is left, and how to get in. A custom model (Horizon-1) estimates how long the outage will last from seven years of federal outage data, benchmarked against standard models.

## What we've built
A working web and iOS app, an EMS board, a responder page, a power-module integration, a replay of a real storm for testing, 57 automated tests plus a 38-check end-to-end security test, and a documented security program (encryption, role-based access with two-factor sign-in for staff, audit logging and daily monitoring). [Recognition: Congressional App Challenge NH-01 result, verify.] [Letter of support: Palo Alto Fire Department, verify.]

## The project
A [3–6]-month pilot with [Department] for up to [25] consenting households: enroll, run through real outage events, and measure (1) time from outage to first human check-in, (2) alerts answered, (3) false alarms, (4) resident and responder satisfaction.

## Budget (example, 12 months, verify vendor pricing)
| Item | Est. cost |
|---|---|
| HIPAA-eligible hosting and database (with BAAs) | $[1,200–6,000] |
| SMS and voice alerts (BAA-eligible plan) | $[500–2,000] |
| Power modules for households without a spare phone (25 × $[60–120]) | $[1,500–3,000] |
| Independent penetration test | $[0 (pro bono) – 8,000] |
| Legal review (privacy policy, BAA, MOU) | $[0 (law clinic) – 3,000] |
| Apple Developer Program | $99 |
| **Total** | **$[3,300–22,000]** |

## Who could fund it
- **FEMA Fire Prevention & Safety grants** (applied for by the fire department; community risk reduction for high-risk populations, including older adults) [verify current cycle].
- Community foundations (e.g. Silicon Valley Community Foundation), Rotary, Kiwanis, AARP chapters.
- Utility and state programs for medical-baseline and access-and-functional-needs customers (PG&E, CPUC, Cal OES; NH Homeland Security & Emergency Management) [verify].
- Student programs: Congressional App Challenge, Conrad Challenge, Diamond Challenge.
- Receiving funds: most grants pay organizations. A fiscal sponsor such as Hack Club's (HCB) lets a student-led project receive grants and donations through a nonprofit.
