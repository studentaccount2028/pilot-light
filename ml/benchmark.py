# AI-assisted: written with Claude Code from the team's forecast spec.
# Benchmark: the outage-length model against standard alternatives, on the same data, the same features
# (one hour in), and the same validation as train.py: 5 folds grouped by storm, repeated over 5 storm shuffles.
# The December 2025 storm stays held out, as everywhere else.
#   Naive baseline        every outage lasts the training median
#   Linear AFT            log-normal accelerated failure time regression (the textbook parametric survival model)
#   Random forest         500 trees on log outage length
#   Gradient-boosted AFT  ours (XGBoost, survival:aft), as shipped in the app
# Output: ml/out/benchmark.json
import json
import os
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import GroupKFold

HERE = os.path.dirname(__file__)
t = pd.read_csv(os.path.join(HERE, "data", "table.csv"), dtype={"fips": str})
HOLDOUT = ["2025-12-28", "2025-12-29", "2025-12-30"]
dev = t[~t.storm.isin(HOLDOUT)]
pos = dev[dev.y_outage == 1].copy()
pos["T"] = pos["o_home_hours"].clip(lower=0.25)

EVENT = [c for c in t.columns if c.startswith("ev_")]
COLS = EVENT + ["duration_hours", "month_sin", "month_cos", "night_onset", "fc_iceIn", "fc_snowIn", "fc_gustMph",
                "roadside_canopy_pct", "heavily_treed_share", "o_share_1h", "o_growth_1h", "o_start_hour_utc"]
XGB_B = dict(objective="survival:aft", eval_metric="aft-nloglik", aft_loss_distribution="normal",
             aft_loss_distribution_scale=1.0, max_depth=3, learning_rate=0.03, min_child_weight=4,
             subsample=0.8, colsample_bytree=0.8, reg_lambda=5.0)


def folds(d, seed, k=5):
    storms = d.storm.unique()
    perm = {s: i for i, s in enumerate(np.random.default_rng(seed).permutation(storms))}
    return list(GroupKFold(n_splits=k).split(d, groups=d.storm.map(perm).values))


def concordance(T, pred):
    T, pred = np.asarray(T), np.asarray(pred)
    num = den = 0.0
    for i in range(len(T)):
        longer = T > T[i]
        den += longer.sum()
        num += (pred[longer] > pred[i]).sum() + 0.5 * (pred[longer] == pred[i]).sum()
    return num / den


def dense(X):
    # linear models need complete inputs: fill gaps with 0 and flag them
    X = X.copy()
    for c in ["fc_iceIn", "fc_snowIn", "fc_gustMph"]:
        X[c + "_known"] = X[c].notna().astype(int)
    return X.fillna(0)


def naive(tr, te):
    return np.full(len(te), np.median(tr["T"]))


def linear_aft(tr, te):
    Xtr, Xte = dense(tr[COLS]), dense(te[COLS])
    mu, sd = Xtr.mean(), Xtr.std().replace(0, 1)
    m = LinearRegression().fit((Xtr - mu) / sd, np.log(tr["T"]))   # MLE of log-normal AFT (no censoring)
    return np.exp(m.predict((Xte - mu) / sd))


def forest(tr, te):
    m = RandomForestRegressor(n_estimators=500, min_samples_leaf=5, max_features=0.5, random_state=0, n_jobs=-1)
    m.fit(dense(tr[COLS]), np.log(tr["T"]))
    return np.exp(m.predict(dense(te[COLS])))


def gbdt_aft(tr, te):
    dm = xgb.DMatrix(tr[COLS], missing=np.nan)
    dm.set_float_info("label_lower_bound", tr["T"].values)
    dm.set_float_info("label_upper_bound", tr["T"].values)
    m = xgb.train(XGB_B, dm, num_boost_round=300)
    return m.predict(xgb.DMatrix(te[COLS], missing=np.nan))


MODELS = {"Naive baseline (median)": naive, "Linear AFT (log-normal)": linear_aft,
          "Random forest": forest, "Gradient-boosted AFT (ours)": gbdt_aft}
out = {}
for name, fit in MODELS.items():
    cs, errs, aucs = [], [], []
    for seed in range(5):
        oof = np.zeros(len(pos))
        for tr, te in folds(pos, seed):
            oof[te] = fit(pos.iloc[tr], pos.iloc[te])
        cs.append(concordance(pos["T"], oof))
        errs.append(np.median(np.abs(np.log2(oof) - np.log2(pos["T"]))))
        aucs.append(roc_auc_score(pos["T"] > 4, oof) if np.ptp(oof) > 0 else 0.5)
    out[name] = {"c_index": round(float(np.mean(cs)), 3), "c_sd": round(float(np.std(cs)), 3),
                 "typical_error_factor": round(float(2 ** np.mean(errs)), 2), "auc_dark_over_4h": round(float(np.mean(aucs)), 3)}
    print(f"C={np.mean(cs):.3f} ± {np.std(cs):.3f}  AUC>4h={np.mean(aucs):.3f}  error x{2 ** np.mean(errs):.2f}  {name}")
json.dump({"outages": int(len(pos)), "storms": int(pos.storm.nunique()), "models": out},
          open(os.path.join(HERE, "out", "benchmark.json"), "w"), indent=2)
