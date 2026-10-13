# Backtest: ten winters of NWS warnings, three years of real outages

Two scripts, run in order:

- `npm run backtest` replays every qualifying NWS event for every New Hampshire forecast zone (NHZ001–NHZ015) from July 2016 to June 2026, from the Iowa Environmental Mesonet VTEC archive. Inputs `data/backtest/NHZ0xx.json`; outputs `summary.json` and `warnings.csv`.
- `npm run backtest:outages` joins those events to real outages: the Department of Energy / ORNL EAGLE-I dataset of county-level customers-out every 15 minutes, New Hampshire rows for 2023, 2024 and 2025 (`eaglei_nh_20xx.csv`, filtered from the public files; `MCC.csv` is the county customer count). Output `outages-summary.json`.

## The questions

1. **Coverage.** When the power really went out, was Pilot Light's watch armed? The dead-man's switch only starts a countdown while a qualifying NWS event covers the zone. An outage outside one is invisible to it.
2. **Cost.** How often is a household on watch, and how often is the resident asked the storm-prompt question?
3. **Notice.** How long before the hazard does the storm prompt go out?

## What changed because of it

The original arming set was the four warnings: Winter Storm, Ice Storm, High Wind, Blizzard. Against three years of real outages that set was armed at the start of **17%** of outage episodes, **44%** of the big ones (10% or more of a county's customers out), and during **45%** of all peak customers-out.

Adding **Wind Advisory** to the arming set raised those to **34%**, **58%** and **59%**, for 190 hours on watch per county per year instead of 106. Adding Winter Weather Advisory on top bought little more (62% of peak customers-out) for 336 hours. So the engine now arms on the four warnings plus Wind Advisory, and sends the resident's storm prompt only for the warnings, so prompt load did not change.

| Arming set | Outage episodes covered | Big episodes (10%+ of county) covered | Share of peak customers-out covered | Hours on watch, per county per year |
|---|---|---|---|---|
| Four warnings only | 63 of 366 (17%) | 35 of 80 (44%) | 45% | 106 |
| **Four warnings + Wind Advisory (now)** | **125 of 366 (34%)** | **46 of 80 (58%)** | **59%** | **190** |
| + Winter Weather Advisory | 139 of 366 (38%) | 49 of 80 (61%) | 62% | 336 |
| + Winter Storm Watch, High Wind Watch | 139 of 366 (38%) | 49 of 80 (61%) | 62% | 336 |

An outage episode is a county's customers-out at or above 2% of its customers for at least an hour (gaps up to three hours bridged). 366 such episodes occurred in 2023–2025; 219 in November–April.

## Results with the current set

**Coverage (2023–2025).** 125 of 366 episodes began under an arming event (34%); 119 of the 219 winter episodes (54%); 46 of the 80 episodes that hit 10% of a county (58%); 13 of the 16 that hit 25% (81%). All twelve largest outages of the three years, from the April 4, 2024 heavy-snow storm (Rockingham 64,000 out, Carroll over 100% of its modeled customer count) to the January 23 and March 14, 2023 storms, began under a warning. 59% of all peak customers-out happened under an arming event.

**What is missed.** Two thirds of episodes, mostly small ones: 2–5% of a county, outside any NWS product, in every month of the year. Summer thunderstorms and equipment failures are not storms the Weather Service warns about. Pilot Light does not claim to catch those, and the write-up should say so.

**Cost (2016–2026, 10 winters).** 1,724 arming events across the 15 zones: 930 Wind Advisories, 713 Winter Storm Warnings, 67 High Wind Warnings, 14 Blizzard Warnings, and **no Ice Storm Warnings at all**. NWS Gray covers ice under Winter Storm Warnings in New Hampshire (the December 28, 2025 Ossipee warning in the demo forecast up to half an inch of ice). An NH-01 household is on watch about 12 times a winter for about 168 hours in total (Carroll County: about 12.5 times and 190 hours), roughly 2% of the year. The resident is asked the storm-prompt question only for warnings: about **5.4 times a winter** in NH-01.

**Notice.** For the warnings that carry the prompt, the median time from bulletin to hazard onset is **16.7 hours**; 694 of 794 (87%) give six hours or more and 65 (8%) give under an hour. Wind Advisories are issued closer to the event (median lead across all arming events: 13.3 hours).

**Yield.** Of 362 county-level arming events in 2023–2025, 107 (30%) were followed by an outage episode within the event window. The other 70% cost a household nothing but the hours on watch, since a silent phone during them sends one text that asks the family to confirm.

## What it means for the design

- **The warning gate is a real limit, and now a measured one.** Pilot Light catches the big storm outages, which are the ones that last long enough to run a battery down, and misses most small ones. A plug-in power sensor would remove the gate; until then, the number to quote is 58% of major outages and 81% of the largest.
- **Wind Advisory earned its place.** It roughly doubled coverage for less than double the watch hours and no extra prompts.
- **The prompt is cheap and usually early.** Five or six prompts a winter, with 16.7 hours of median notice, is a fair price for knowing before the storm whether the backup is charged.

## Limits of this backtest

- County-level outage counts cannot say which household lost power. "Covered" means the watch was armed in the household's zone when the county's outage began.
- EAGLE-I's modeled customer count undercounts Carroll County (one episode shows 134% of customers out), so shares there are overstated; counts are not.
- Three years of outage data against ten of warnings. The coverage figures are from 2023–2025 only.
- Lead time is from the bulletin that first carried the event. Earlier watches are not counted, so the notice a family gets is often longer.
- Nothing here measures the heartbeat. The 20-minute silence threshold is a design choice tied to the 5-minute check-in, not a measured value.
- NH-01 is taken as Northern and Southern Carroll, Belknap, Strafford, Eastern Hillsborough, Interior and Coastal Rockingham; district lines do not follow forecast zones exactly.

## Method notes

- The VTEC archive lists one row per product update; rows are deduplicated per zone on onset time and event type. The bulletin time is read from the product id (`YYYYMMDDHHMM-KGYX-...`); the onset is the VTEC event start.
- Zones map to counties (Northern and Southern Carroll both to Carroll, and so on); events are deduplicated per county for the yield figure.
- "Winter" runs July to June and is named for the year it ends; "winter episodes" are November to April.
- Outage rows with a blank customers-out value are skipped.
