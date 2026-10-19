# Forecast: will Mom's battery outlast the outage?

Pilot Light knows how long Mom's backup lasts (four hours on her oxygen concentrator). Until now it did not know the other number that decides whether she is in danger: how long the outage will last. A two-hour outage is an inconvenience. A fourteen-hour ice-storm outage is an emergency. This is the model that estimates that second number, how it was validated, and where it falls short.

Everything here is reproducible from `ml/` (Python): `fetch_weather.py`, `build_outages.py`, `build_trees.py`, `build_features.py`, `train.py`, `nowcast.py`, `export.py`. The trained model ships in `src/data/outage-length-model.json` and runs in the app through `src/lib/engine/outageLength.ts`.

## Data

| Source | What it gives | Use |
|---|---|---|
| DOE/ORNL EAGLE-I, NH counties, 2019–2025 | customers out every 15 minutes (658,888 readings) | outages, their length, and how fast they spread |
| NWS events (Iowa Environmental Mesonet VTEC archive) | 833 county-level warnings and advisories | the storms, and the forecast amounts in each bulletin |
| ASOS station weather (IEM), 13 NH and nearby stations, 2019–2025 | hourly gusts, precipitation, freezing rain, sleet, snow, temperature | what the storm actually did |
| USFS/NLCD Tree Canopy Cover 2021 + OpenStreetMap roads | canopy at 73,127 points every 150 m along 11,000 km of NH roads | trees beside the roads, where distribution lines mostly run |

An outage episode is the same definition as `scripts/backtest-outages.mjs`: a county's customers out at or above 2% for at least an hour, gaps up to three hours bridged. The rebuilt labels agree with `data/backtest/events-labeled.csv` on 96.5% of events.

**How long homes stay dark.** EAGLE-I counts customers, not houses, so a household's outage length is estimated as customer-hours divided by peak customers out, the same idea as the utility reliability measure CAIDI. It describes a typical affected home in the county, not a particular house, and the app says so.

## Validation

As in the backtest: five folds split by storm (onset date), never by row, repeated five times with different storm shuffles, reported as mean ± standard deviation. One storm touches many counties; splitting by row would let a model recognise the storm and flatter itself.

**The storm backtest.** The December 28–30, 2025 storm (the Winter Storm Warning the app's replay uses, and the Wind Advisory on its back side) was held out of everything: training, model choice, tuning. It was scored once, at the end.

## Results

### How long will homes be dark? (asked one hour into an outage)

| Model | C-index | AUC for "dark more than 4 hours" | Typical error |
|---|---|---|---|
| Before the outage: forecast + calendar + roadside trees | 0.603 ± 0.032 | 0.665 | × 2.0 |
| **One hour in: + how fast the outage is spreading** | **0.696 ± 0.007** | **0.794** | **× 1.7** |

Gradient-boosted survival regression (XGBoost, accelerated failure time, log-normal). C-index: of two outages, how often the longer one was predicted longer (0.5 is a coin flip). The first hour is the strongest signal: how much the county's outage grew in that hour, then how long the warning runs, then the time of day it started.

Calibration of "chance the home is still dark after 4 hours", in fifths of predicted risk:

| Predicted | 17% | 32% | 49% | 64% | 82% |
|---|---|---|---|---|---|
| Observed | 15% | 15% | 51% | 74% | 80% |

### Benchmark against standard models

`ml/benchmark.py`: the same outages, the same one-hour-in features, the same storm-grouped 5×5 cross-validation.

| Model | C-index | AUC for "dark more than 4 hours" | Typical error |
|---|---|---|---|
| Linear AFT (log-normal regression, the textbook parametric survival model) | 0.591 ± 0.008 | 0.655 | × 2.0 |
| Random forest (500 trees, log outage length) | 0.677 ± 0.004 | 0.769 | × 1.9 |
| **Gradient-boosted AFT (ours)** | **0.696 ± 0.007** | **0.794** | **× 1.7** |

A constant guess (every outage lasts the median) scores at or below chance (C-index 0.44 here, 0.5 by construction).

### The held-out storm, December 29, 2025

| County | Predicted dark (1 h in) | Actual (typical home) | Chance it outlasts a 4 h battery |
|---|---|---|---|
| **Carroll** | **8.7 h** | **8.6 h** | 83% |
| Sullivan | 5.3 h | 5.7 h | 63% |
| Grafton | 9.1 h | 4.1 h | 84% |
| Belknap | 3.0 h | 5.5 h | 37% |
| Merrimack | 5.9 h | 1.3 h | 68% |

Carroll County, where the demo household is, was predicted within six minutes. The storm as a whole was mixed: two close, two overestimates, one underestimate. The cross-validated numbers above are the ones to quote.

### Will the power go out? (before the storm, and as it arrives)

| Model | AUC |
|---|---|
| The app's current logistic regression | 0.652 ± 0.014 |
| Gradient-boosted trees, same features | 0.603 ± 0.018 |
| Logistic + roadside trees | 0.651 ± 0.016 |
| Gradient-boosted + roadside trees | 0.619 ± 0.016 |

Deeper models did not help before the storm. With 817 events, gradient-boosted trees overfit what logistic regression does not; the bulletin text simply does not carry much more signal. This matches the original finding in `docs/backtest.md`.

**As the storm arrives** (`nowcast.py`): the model only sees station weather up to a cutoff, and is only asked about outages that had not started by then, so nothing it sees comes from after the outage.

| Hours into the warning | Before-storm model | + weather observed so far |
|---|---|---|
| 2 | 0.643 | 0.664 |
| 4 | 0.641 | 0.694 |
| 6 | 0.649 | 0.713 |

Live weather sharpens the estimate as the storm comes in, clearing the 0.65 bar after about four hours. (Scoring with the whole event's weather gives 0.73, but some of that weather falls after the outage began; it is reported in `ml/out/report.json` as a description of severity, not a forecast.)

## In the app

During an outage, once the county's first hour is known, the Home screen shows how long the outage is likely to last next to the shortest backup, and the chance it outlasts it. `tests/outage-length.test.ts` checks that the TypeScript tree walk matches XGBoost on exported fixtures (to 1e-4), that the app builds every feature the model was trained on, and that faster-spreading outages are predicted longer.

The replayed storm uses the real EAGLE-I record for Carroll County's first hour (`src/data/outage-spread.json`). For live storms the first hour would come from the utilities' outage counts; that feed is not built, so the app does not show the race during a live storm yet.

## Limits

- County, not house. Outage lengths are for a typical affected home in the county. A particular house can be restored much sooner or later.
- The length estimate is a proxy (customer-hours per peak customer out), not a measured household outage.
- 205 outages to learn from. The model is deliberately shallow and regularized; more winters will help.
- Roadside canopy is county-level here and ranked fifth among the drivers of whether an outage happens, behind storm length and timing. Circuit-level exposure would need utility data that is not public.
- One held-out storm is an illustration, not proof. Grafton and Merrimack were overestimated by a factor of two or more.
