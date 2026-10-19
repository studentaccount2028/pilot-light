# AI-assisted: written with Claude Code from the team's forecast spec.
# Builds the training table: one row per (county, NWS storm event), 2019-2025.
#
# For each event it records whether a real outage followed (DOE/ORNL EAGLE-I
# county customers-out every 15 minutes) and, when one did, how long it lasted
# and how it looked in its first hour. The episode definition matches
# scripts/backtest-outages.mjs exactly, so these rows agree with
# data/backtest/events-labeled.csv.
#
# Output: ml/data/storms.csv
import json
import os

import numpy as np
import pandas as pd

ROOT = os.path.join(os.path.dirname(__file__), "..")
DATA = os.path.join(ROOT, "data", "backtest")
OUT = os.path.join(os.path.dirname(__file__), "data")

EPISODE_SHARE = 0.02            # county customers-out at or above 2% ...
EPISODE_MIN_H = 1.0             # ... for at least an hour
GAP_H = 3.0                     # readings this far apart end an episode
LOOKAHEAD_H = 6.0               # an outage can start this long after the event ends

# ── customers per county (modeled customer count) ──
mcc = pd.read_csv(os.path.join(DATA, "MCC.csv"), encoding="utf-8-sig")
mcc = mcc[pd.to_numeric(mcc["County_FIPS"], errors="coerce").notna()]   # drop the "Grand Total" row
customers = {str(int(r.County_FIPS)): int(r.Customers) for r in mcc.itertuples() if str(int(r.County_FIPS)).startswith("33")}

# ── outage readings ──
frames = []
for y in range(2019, 2026):
    f = pd.read_csv(os.path.join(DATA, f"eaglei_nh_{y}.csv"), dtype={"fips_code": str})
    frames.append(f)
eag = pd.concat(frames)
eag = eag.dropna(subset=["customers_out"])
eag["t"] = pd.to_datetime(eag["run_start_time"], utc=True)
eag = eag.sort_values(["fips_code", "t"])

# ── episodes: runs at or above 2% of a county's customers, gaps up to 3 h bridged ──
episodes = []
for fips, g in eag.groupby("fips_code"):
    thr = customers.get(fips, np.inf) * EPISODE_SHARE
    cur = None
    rows = list(zip(g["t"], g["customers_out"]))
    for i, (t, out) in enumerate(rows):
        if out >= thr and (cur is None or (t - cur["end"]).total_seconds() / 3600 <= GAP_H):
            if cur is None:
                cur = {"fips": fips, "start": t, "end": t, "peak": 0.0, "idx0": i}
            cur["end"] = t
            cur["peak"] = max(cur["peak"], out)
        elif cur is not None:
            if (cur["end"] - cur["start"]).total_seconds() / 3600 >= EPISODE_MIN_H:
                cur["idx1"] = i
                episodes.append((cur, rows))
            cur = {"fips": fips, "start": t, "end": t, "peak": out, "idx0": i} if out >= thr else None
    if cur is not None and (cur["end"] - cur["start"]).total_seconds() / 3600 >= EPISODE_MIN_H:
        cur["idx1"] = len(rows)
        episodes.append((cur, rows))


def describe(ep, rows):
    """What the episode looked like: length, size, and its first hour (what a live model can see)."""
    fips, n = ep["fips"], customers[ep["fips"]]
    seg = rows[ep["idx0"]:ep["idx1"]]
    t0 = ep["start"]
    dur_h = (ep["end"] - ep["start"]).total_seconds() / 3600 + 0.25
    cust_hours = sum(out for _, out in seg) * 0.25
    first = [out for t, out in seg if (t - t0).total_seconds() <= 3600]
    return {
        "fips": fips,
        "ep_start": t0, "ep_end": ep["end"],
        "duration_h": round(dur_h, 2),
        "peak_share": ep["peak"] / n,
        # customer-hours per peak customer out: a proxy for how long a typical
        # affected home was dark (CAIDI-style), since EAGLE-I has no per-home data
        "home_hours": round(cust_hours / max(ep["peak"], 1), 2),
        "share_0h": first[0] / n,
        "share_1h": max(first) / n,
        "growth_1h": (max(first) - first[0]) / n,
        "start_hour_utc": t0.hour,
    }


ep_df = pd.DataFrame([describe(e, r) for e, r in episodes])
print(f"{len(ep_df)} outage episodes, 2019-2025 ({(ep_df.ep_start.dt.year >= 2019).sum()} in range)")

# ── storm events (county level), with the forecast amounts read out of each bulletin ──
ev = pd.read_csv(os.path.join(DATA, "events-labeled.csv"), dtype={"fips": str})
ev["onset_t"] = pd.to_datetime(ev["onset"], utc=True)
ev["expires_t"] = ev["onset_t"] + pd.to_timedelta(ev["duration_hours"], unit="h")
text = json.load(open(os.path.join(DATA, "events-text.json")))
for col in ("iceIn", "snowIn", "gustMph"):
    ev["fc_" + col] = [text.get(f"{r.fips}|{r.event}|{r.onset}", {}).get(col) for r in ev.itertuples()]

# ── link each event to the biggest outage episode that began in its window ──
linked = []
for r in ev.itertuples():
    lo = r.onset_t - pd.Timedelta(hours=1)
    hi = r.expires_t + pd.Timedelta(hours=LOOKAHEAD_H)
    m = ep_df[(ep_df.fips == r.fips) & (ep_df.ep_start >= lo) & (ep_df.ep_start <= hi)]
    if len(m):
        best = m.sort_values("peak_share", ascending=False).iloc[0].to_dict()
        best["lead_h"] = (best["ep_start"] - r.onset_t).total_seconds() / 3600
        linked.append(best)
    else:
        linked.append({})
lk = pd.DataFrame(linked)
lk.columns = ["o_" + c for c in lk.columns]
storms = pd.concat([ev.reset_index(drop=True), lk.reset_index(drop=True)], axis=1)
storms["y_outage"] = storms["o_duration_h"].notna().astype(int)
# the storm a row belongs to: its onset date. one storm touches many counties, so
# cross-validation folds are split by this, never by row
storms["storm"] = storms["onset_t"].dt.strftime("%Y-%m-%d")
agree = (storms["y_outage"] == storms["outage"]).mean()
print(f"{len(storms)} county-storm rows, {storms.y_outage.sum()} followed by an outage "
      f"({storms.y_outage.mean():.0%}); agreement with events-labeled.csv: {agree:.1%}")
os.makedirs(OUT, exist_ok=True)
storms.to_csv(os.path.join(OUT, "storms.csv"), index=False)
ep_df.to_csv(os.path.join(OUT, "episodes.csv"), index=False)
pos = storms[storms.y_outage == 1]
print(f"outage length (county episode): median {pos.o_duration_h.median():.1f} h, "
      f"90th pct {pos.o_duration_h.quantile(.9):.1f} h; typical home dark: median {pos.o_home_hours.median():.1f} h")
dec = storms[(storms.storm.isin(["2025-12-28", "2025-12-29"]))]
print("Dec 28-29 2025 rows:\n", dec[["county", "event", "onset", "y_outage", "o_duration_h", "o_home_hours", "o_peak_share"]].to_string(index=False))
