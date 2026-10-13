# Submission drafts

Draft answers for the Congressional App Challenge form, written to match what the app does today. Edit freely; the facts are checked against the code.

**Deadline.** The national rules page lists October 26 as the deadline for students to register and submit. The NH-01 office page still showed the 2025 cycle (October 30, 2025, 5:00 pm) when fetched on October 13, 2026, so confirm the NH-01 time on the live portal. Eligibility (from the NH-01 page): middle or high school in October; live in or attend school in NH-01; teams of up to four with at least half in the district; one app per student per year.

## One-sentence purpose

Pilot Light counts down a medically dependent rural senior's backup-battery hours during a winter power outage and texts and calls their family, a neighbor, and their town before the clock runs out.

## What inspired it

In New Hampshire, 25.5% of older adults live alone, the state ranks first in the nation for senior social-isolation risk, and single winter storms have left 76,000 and 230,000 customers without power. The three electric utilities keep "life-support" lists, but Unitil's says it "will attempt to notify" customers, Liberty's is a phone number, and Eversource's form protects against shutoff for non-payment. Nobody holds a live picture of who is on oxygen in Ossipee at hour six of an outage. Carroll County, the oldest county in the state at 28.3% over 65, has seven licensed EMS agencies and no response-time standard. We built the thing that notices.

The closest prior App Challenge entries are SafeLink (KY-05, 2025), a disaster early-warning and family check-in app, and Lifeline (CA-13, 2024), a disaster-information app with large fonts for seniors. Neither models a household's device runtime, infers an outage, or escalates to a town roster.

## What it does

The family sets up the household once: the address, each powered medical device and its backup hours, who lives there, and up to four people to contact. A phone that stays at the house checks in every few minutes on its own; the person who lives there never opens an app. The server polls National Weather Service warnings for the household's forecast zone. When a warning starts, the resident gets one text or call: is your backup charged, plugged in and within reach? If, during a warning, the phone at the house goes quiet for 20 minutes, Pilot Light assumes the power is out and starts a countdown from the shortest backup among the devices. At 6 hours, 2 hours and zero it texts family and calls landlines, with OK and HELP replies by text or key press. A risk score built from the resident's answers decides how fast and how widely the ladder goes: a resident who cannot leave the house alone gets everyone alerted at once, with 911 guidance leading the message. A town volunteer coordinator sees an opt-in roster sorted by urgency with the nearest fire, police and hospital and their drive times.

## The technical difficulty

Pilot Light has to keep working during the exact event that takes down its own infrastructure: power, home broadband, and often cell data fail together in a New Hampshire ice storm. So we designed it as a system that assumes its own failure.

First, inference from silence: a server-side dead-man's switch that combines the last heartbeat from the phone at the house with an active NWS warning over the household's zone, and starts the countdown without anyone doing anything. Either signal alone does nothing; both together for 20 minutes do. Second, SMS and voice as the transport of last resort: every alert and every reply is a plain text message or a text-to-speech call, which rides on 2G signal and reaches a landline in a house with no cell service. Third, store-and-forward on the phone: a battery reading entered at hour three while offline waits in IndexedDB and sends when any connection returns. Fourth, idempotent delivery: a unique database index on (household, outage, threshold, contact, channel) plus a claim lease means two workers racing on the same tick cannot text a family twice; we tested this by running three evaluators at once against a replayed storm. Fifth, a backtest: ten winters of real NWS events for all fifteen New Hampshire forecast zones, joined to three years of real county outage records from the Department of Energy's EAGLE-I dataset. It showed our original arming set caught 44% of major outages; adding Wind Advisory raised that to 58% (81% of the largest) for no extra prompts, so we changed the engine. It also put a number on the cost: about five storm prompts a winter, with a median 16.7 hours of notice.

## Stack and data

Next.js 15 and React (TypeScript), Postgres with Drizzle, Twilio for SMS and voice, MapLibre with OpenFreeMap tiles. Live data: the NWS Alerts API (`api.weather.gov`, polled every 60 seconds) and the NWS points endpoint for zone lookup; NH GRANIT GIS layers for town boundaries and fire, police, hospital and urgent-care sites; the public OSRM router for drive times; OpenStreetMap Nominatim for geocoding. Historical: the Iowa Environmental Mesonet VTEC archive and the DOE EAGLE-I outage dataset for the backtest, and the replayed December 28, 2025 Ossipee storm warning.

## AI disclosure

We used Claude Code (Anthropic) as a coding assistant throughout this project, and it wrote the large majority of the code from our written specification and our design direction. Every file it touched carries an `// AI-assisted:` header. We designed the product, the outage rules, the risk score and its weights, the escalation ladder, the storm replay harness and the backtest, and we reviewed, tested and can explain every part of the code. No AI runs in the product: the outage inference, the risk score and the message routing are plain rules, written down in `src/lib/engine/` and tested in `tests/`.

## Privacy

Pilot Light stores what the risk score needs and nothing more: the kind of medical device and its backup hours, the resident's age (kept as a birth year), whether they live alone, whether they can leave the house without help, whether they can reach their backup, and a phone number. No diagnoses, no records. Every answer is optional. Sharing with the town volunteer roster is a separate, reversible consent. The household's family holds the account; a town coordinator sees only opted-in households. No HIPAA-covered entity is involved. Pilot Light is not a medical device and does not replace 911; every message says so.

## What's next (v2.0)

A plug-in power sensor that reports mains loss directly, replacing the inferred heartbeat with a measured one. Training an outage-risk model on the EAGLE-I join (which NWS products, in which counties, precede outages) to warn families before the lights go out, and to arm the watch on predicted risk rather than only on published products. A Meshtastic LoRa relay for households with no cell signal. Utility API integration if any New Hampshire utility publishes one.

## Numbers to put on screen

- 25.5% of NH older adults live alone; NH ranks #1 for senior isolation risk.
- 76,000 and 230,000+ NH customers dark in single storms.
- Carroll County: 28.3% over 65, median age 53.4, seven EMS agencies.
- NH senior fall death rate 121.6 per 100,000 against 78.2 nationally.
- Backtest: 1,724 NWS events over 10 winters and 15 zones, joined to 366 real outage episodes (2023–2025). Watch armed for 58% of outages hitting 10%+ of a county and 81% of those hitting 25%+, and all 12 largest storms. About 5 storm prompts a winter with 16.7 h median notice.
