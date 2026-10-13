# Backtest: ten winters of New Hampshire storm warnings

Run with `npm run backtest`. Inputs are in `data/backtest/NHZ0xx.json`; outputs are `data/backtest/summary.json` and `data/backtest/warnings.csv`.

## What was tested

Pilot Light arms a household's watch when one of four NWS warnings covers its forecast zone: Winter Storm Warning, Ice Storm Warning, High Wind Warning, Blizzard Warning. This backtest replays every such warning issued for every New Hampshire forecast zone (NHZ001 to NHZ015) from July 2016 to June 2026, taken from the Iowa Environmental Mesonet's archive of NWS VTEC products. It answers two questions:

1. **How often would the watch arm, and for how long?** That is the false-alarm load on a family: each warning sends one storm prompt to the resident and puts the household on watch.
2. **How much notice would the storm prompt give?** That is the time between the bulletin going out and the hazard beginning, which is the window the family has to charge the backup.

It does **not** measure whether the dead-man's switch would have caught real outages. That needs outage ground truth (when the power actually went out, where), which the free sources do not give at household level. See "What this cannot say".

## Results

794 qualifying warnings across 15 zones and 10 winters: 713 Winter Storm Warnings, 67 High Wind Warnings, 14 Blizzard Warnings, and **no Ice Storm Warnings at all**. NWS Gray covers ice under Winter Storm Warnings in New Hampshire (the December 28, 2025 Ossipee warning in the demo forecast up to half an inch of ice), so the engine's four-event filter is right to include Winter Storm Warning rather than wait for an ice-specific product.

| Measure | Value |
|---|---|
| Warnings per zone per winter, NH-01 zones | 5.4 |
| Hours under warning per zone per winter, NH-01 | 97 |
| Lead time, bulletin to onset: median | 16.7 h |
| Lead time: 10th / 90th percentile | 3.8 h / 27 h |
| Warnings with at least 6 h of notice | 694 of 794 (87%) |
| Warnings with under 1 h of notice | 65 (8%) |
| Warning duration: median / 90th percentile | 19 h / 30 h |

Carroll County, where the demo household lives, is the most warned part of the district: Northern Carroll averages 6.8 warnings and 129 hours under warning a winter, Southern Carroll 6.1 and 114. The coast gets fewer and shorter warnings (Coastal Rockingham: 4.9 a winter, median 14.7 h).

Winters vary a lot: 137 warnings statewide in 2017-18, 55 in 2024-25.

## What it means for the design

- **The storm prompt is cheap.** A family would field about five or six prompts a winter. Each is one text or one call to the resident. That is an acceptable cost for the benefit of knowing before the storm whether the backup is charged.
- **The prompt usually has time to work.** With a median 16.7 hours between bulletin and onset, and 87% of warnings giving six hours or more, the resident's answer is almost always in hand before the power can go out. The 8% of warnings issued within an hour of onset are the case the risk score's "no reply" rule covers: no answer is treated as a reason to check, not as silence.
- **Silence-plus-warning is a narrow trigger.** A household is under warning about 100 hours a winter, roughly 2% of the time. Outside those hours, a quiet phone does nothing. Inside them, 20 minutes of silence starts the clock. The false-positive exposure is bounded by those 100 hours, and a false positive costs one text that asks the family to confirm.

## What this cannot say

- Whether real outages were caught, or how many were missed. That needs outage records with time and place. The best public source is the Department of Energy's EAGLE-I dataset (county-level outage counts every 15 minutes, 2014 onward). Joining it to these warnings by county and hour would give, for each warning, whether an outage followed and how long after onset. That is the next step and is the data an outage-risk model would be trained on.
- Anything about the heartbeat. The archive has no phones in it. The 20-minute silence threshold is a design choice tied to the 5-minute heartbeat cadence, not a measured value.
- Lead time is from the bulletin that first carried the warning. Watches issued a day earlier are not counted, so the real notice a family gets is often longer.

## Method notes

- The archive lists one row per product update, so the same storm appears several times. Rows are deduplicated on onset time and event type per zone.
- The bulletin time is read from the product id (`YYYYMMDDHHMM-KGYX-...`); the hazard onset is the VTEC event start.
- "Winter" runs July to June and is named for the year it ends.
- NH-01 zones are taken as Northern and Southern Carroll, Belknap, Strafford, Eastern Hillsborough, Interior and Coastal Rockingham. District lines do not follow forecast zones exactly.
