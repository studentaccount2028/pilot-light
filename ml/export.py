# AI-assisted: written with Claude Code from the team's forecast spec.
# Exports the "how long will homes be dark" model for the app.
#
# XGBoost saves its trees as JSON; this flattens them into a compact form the
# TypeScript evaluator (src/lib/engine/outageLength.ts) walks, and checks that a
# plain re-implementation of that walk matches XGBoost's own predictions before
# writing anything. It also writes fixtures the TypeScript test replays.
# Output: src/data/outage-length-model.json
import json
import math
import os

import numpy as np
import pandas as pd
import xgboost as xgb

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, "out")
feats = json.load(open(os.path.join(OUT, "features.json")))
report = json.load(open(os.path.join(OUT, "report.json")))
cols = feats["colsB_1h"]

booster = xgb.Booster()
booster.load_model(os.path.join(OUT, "model_b_1h.json"))
raw = json.loads(open(os.path.join(OUT, "model_b_1h.json")).read())
trees = []
for tr in raw["learner"]["gradient_booster"]["model"]["trees"]:
    trees.append({
        "l": tr["left_children"], "r": tr["right_children"],
        "f": tr["split_indices"], "c": [float(x) for x in tr["split_conditions"]],
        "d": [int(x) for x in tr["default_left"]],
    })
base_score = float(raw["learner"]["learner_model_param"]["base_score"].strip("[]"))


def walk(x):
    """The evaluator the app runs: sum each tree's leaf, then undo the log."""
    margin = 0.0
    for t in trees:
        n = 0
        while t["l"][n] != -1:
            v = x[t["f"][n]]
            if v is None or (isinstance(v, float) and math.isnan(v)):
                n = t["l"][n] if t["d"][n] else t["r"][n]
            else:
                # XGBoost compares in 32-bit floats; so must we, or borderline splits flip
                n = t["l"][n] if np.float32(v) < np.float32(t["c"][n]) else t["r"][n]
        margin += t["c"][n]
    return margin


t = pd.read_csv(os.path.join(HERE, "data", "table.csv"), dtype={"fips": str})
pos = t[t.y_outage == 1]
X = pos[cols].astype(float)
xgb_pred = booster.predict(xgb.DMatrix(X, missing=np.nan))
margins = np.array([walk([None if pd.isna(v) else float(v) for v in row]) for row in X.values])
# find how XGBoost combines the base score with the summed leaves for AFT, and verify it
cands = {"exp(log(base)+m)": np.exp(np.log(base_score) + margins), "exp(base+m)": np.exp(base_score + margins), "exp(m)": np.exp(margins)}
best = min(cands, key=lambda k: np.max(np.abs(cands[k] - xgb_pred) / xgb_pred))
err = float(np.max(np.abs(cands[best] - xgb_pred) / xgb_pred))
print(f"evaluator matches XGBoost with {best}: max relative error {err:.2e}")
assert err < 1e-4, "tree walk does not reproduce XGBoost"

fixtures = []
for (_, r), p in list(zip(pos.iterrows(), xgb_pred))[:12]:
    fixtures.append({"features": {c: (None if pd.isna(r[c]) else float(r[c])) for c in cols}, "expectedHours": round(float(p), 5)})

trees_county = pd.read_csv(os.path.join(HERE, "data", "trees_county.csv"), dtype={"fips": str})
names = {"33001": "Belknap", "33003": "Carroll", "33005": "Cheshire", "33007": "Coos", "33009": "Grafton",
         "33011": "Hillsborough", "33013": "Merrimack", "33015": "Rockingham", "33017": "Strafford", "33019": "Sullivan"}
model = {
    "kind": "xgboost survival:aft (normal), outage length for a typical affected home",
    "trainedOn": "DOE/ORNL EAGLE-I county outages 2019-2025 joined to NWS events (IEM VTEC), "
                 "ASOS station weather, NLCD 2021 roadside tree canopy. Dec 28-30 2025 storm held out.",
    "features": cols,
    "combine": best,
    "baseScore": base_score,
    "sigma": feats["sigma_1h"],
    "metrics": {"cIndex": report["model_b"]["One hour in: + how fast the outage is spreading"]["c_index"],
                "aucDarkOver4h": report["model_b"]["One hour in: + how fast the outage is spreading"]["auc_dark_over_4h"],
                "cv": "5-fold grouped by storm, 5 repeats"},
    "roadsideCanopy": {names[r.fips]: {"pct": round(float(r.roadside_canopy_pct), 2), "heavyShare": round(float(r.heavily_treed_share), 4)}
                       for r in trees_county.itertuples()},
    "trees": trees,
    "fixtures": fixtures,
}
path = os.path.join(HERE, "..", "src", "data", "outage-length-model.json")
json.dump(model, open(path, "w"))
print(f"wrote {path} ({os.path.getsize(path) / 1024:.0f} KB, {len(trees)} trees)")
