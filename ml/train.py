# AI-assisted: written with Claude Code from the team's forecast spec.
# Pilot Light Forecast: two models, validated the way scripts/train-outage-model.mjs is
# (folds split by storm, never by row), and compared against baselines.
#
#   Model A  "Will the power go out?"   before the storm.  binary, gradient-boosted trees
#   Model B  "How long will homes be dark?"  one hour into an outage.  survival (AFT), gradient-boosted
#
# "The race": P(a home is still dark when the battery runs out) = P(outage) x P(dark > battery | outage).
#
# The December 28-29, 2025 storm is held out of everything (training, tuning, CV) and only
# scored at the very end: the storm backtest.
# Output: ml/out/report.json, ml/out/*.png, ml/out/model.json (for the app)
import json
import os

import numpy as np
import pandas as pd
import xgboost as xgb
from scipy.stats import norm
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, "out")
os.makedirs(OUT, exist_ok=True)

t = pd.read_csv(os.path.join(HERE, "data", "table.csv"), dtype={"fips": str})
# the Dec 28-29 storm and its backside winds on Dec 30 are one system: hold all of it out
HOLDOUT = ["2025-12-28", "2025-12-29", "2025-12-30"]
hold = t[t.storm.isin(HOLDOUT)].copy()
dev = t[~t.storm.isin(HOLDOUT)].copy()

EVENT = ["ev_winter_storm", "ev_high_wind", "ev_blizzard_warning", "ev_wind_advisory"]
CAL = ["duration_hours", "month_sin", "month_cos", "night_onset"]
FC = ["fc_iceIn", "fc_snowIn", "fc_gustMph"]
TREES = ["roadside_canopy_pct", "heavily_treed_share"]
OBS = ["obs_gust_kt", "obs_wind_kt", "obs_precip_in", "obs_frz_hours", "obs_sleet_hours", "obs_snow_hours", "obs_glaze_hours", "obs_min_temp_f"]
FIRST_HOUR = ["o_share_1h", "o_growth_1h", "o_start_hour_utc"]
COUNTY = sorted(t.fips.unique())

# fix the event column names (Blizzard -> ev_blizzard_warning etc. from build_features)
EVENT = [c for c in t.columns if c.startswith("ev_")]


def county_onehot(d):
    return pd.DataFrame({f"cty_{c}": (d.fips == c).astype(int) for c in COUNTY}, index=d.index)


def folds(d, seed, k=5):
    """5 folds grouped by storm, with storms shuffled by seed."""
    storms = d.storm.unique()
    rng = np.random.default_rng(seed)
    perm = {s: i for i, s in enumerate(rng.permutation(storms))}
    g = d.storm.map(perm).values
    return list(GroupKFold(n_splits=k).split(d, groups=g))


# ── Model A: will the power go out? ──
XGB_A2 = dict(objective="binary:logistic", max_depth=2, learning_rate=0.03, n_estimators=300, subsample=0.8,
              colsample_bytree=0.8, min_child_weight=10, reg_lambda=10.0, eval_metric="auc")
XGB_A = dict(objective="binary:logistic", max_depth=3, learning_rate=0.03, n_estimators=400, subsample=0.8,
             colsample_bytree=0.8, min_child_weight=5, reg_lambda=5.0, eval_metric="auc")


def cv_auc(make, X, y, d, reps=5):
    aucs, oof_all = [], np.zeros(len(y))
    for seed in range(reps):
        oof = np.zeros(len(y))
        for tr, te in folds(d, seed):
            m = make()
            m.fit(X.iloc[tr], y.iloc[tr])
            oof[te] = m.predict_proba(X.iloc[te])[:, 1]
        aucs.append(roc_auc_score(y, oof))
        oof_all += oof / reps
    return float(np.mean(aucs)), float(np.std(aucs)), oof_all


yA = dev.y_outage
variants = {
    "Current app model (logistic, event + county + calendar + forecast)": (
        lambda: make_pipeline(StandardScaler(), LogisticRegression(C=0.5, max_iter=2000)),
        lambda d: pd.concat([d[EVENT + CAL], county_onehot(d), d[FC].fillna(0), d[FC].notna().astype(int).add_suffix("_known")], axis=1)),
    "Gradient-boosted trees, same features": (
        lambda: xgb.XGBClassifier(**XGB_A),
        lambda d: pd.concat([d[EVENT + CAL + FC], county_onehot(d)], axis=1)),
    "Gradient-boosted trees + roadside trees (no county IDs)": (
        lambda: xgb.XGBClassifier(**XGB_A),
        lambda d: d[EVENT + CAL + FC + TREES]),
    "Shallow gradient-boosted trees + roadside trees + county": (
        lambda: xgb.XGBClassifier(**XGB_A2),
        lambda d: pd.concat([d[EVENT + CAL + FC + TREES], county_onehot(d)], axis=1)),
    "Logistic + roadside trees (no county IDs)": (
        lambda: make_pipeline(StandardScaler(), LogisticRegression(C=0.5, max_iter=2000)),
        lambda d: pd.concat([d[EVENT + CAL + TREES], d[FC].fillna(0), d[FC].notna().astype(int).add_suffix("_known")], axis=1)),
    "During the storm: logistic + observed station weather": (
        lambda: make_pipeline(StandardScaler(), LogisticRegression(C=0.5, max_iter=2000)),
        lambda d: pd.concat([d[EVENT + CAL + TREES + OBS].fillna(0), d[FC].fillna(0), d[FC].notna().astype(int).add_suffix("_known")], axis=1)),
    "During the storm: gradient-boosted + observed station weather": (
        lambda: xgb.XGBClassifier(**XGB_A),
        lambda d: d[EVENT + CAL + FC + TREES + OBS]),
    "During the storm: shallow gradient-boosted + observed weather": (
        lambda: xgb.XGBClassifier(**XGB_A2),
        lambda d: d[EVENT + CAL + FC + TREES + OBS]),
}
resA = {}
for name, (make, feats) in variants.items():
    mean, sd, oof = cv_auc(make, feats(dev), yA, dev)
    resA[name] = {"auc": round(mean, 3), "sd": round(sd, 3)}
    print(f"A  {mean:.3f} ± {sd:.3f}  {name}")

# ── Model B: how long will homes be dark? (outage rows only) ──
pos = dev[dev.y_outage == 1].copy()
pos["T"] = pos["o_home_hours"].clip(lower=0.25)
XGB_B = dict(objective="survival:aft", eval_metric="aft-nloglik", aft_loss_distribution="normal",
             aft_loss_distribution_scale=1.0, max_depth=3, learning_rate=0.03, min_child_weight=4,
             subsample=0.8, colsample_bytree=0.8, reg_lambda=5.0)
ROUNDS_B = 300


def fit_aft(X, T):
    dm = xgb.DMatrix(X, missing=np.nan)
    dm.set_float_info("label_lower_bound", np.log(T))   # xgboost AFT works on log time when we pass log bounds? no: pass raw times
    dm.set_float_info("label_lower_bound", T.values)
    dm.set_float_info("label_upper_bound", T.values)    # every episode ended (no censoring)
    return xgb.train(XGB_B, dm, num_boost_round=ROUNDS_B)


def pred_aft(m, X):
    return m.predict(xgb.DMatrix(X, missing=np.nan))   # predicted median time (hours)


def concordance(T, pred):
    """Harrell's C: for pairs of outages, how often the longer one was predicted longer."""
    T, pred = np.asarray(T), np.asarray(pred)
    num = den = 0.0
    for i in range(len(T)):
        longer = T > T[i]
        den += longer.sum()
        num += (pred[longer] > pred[i]).sum() + 0.5 * (pred[longer] == pred[i]).sum()
    return num / den


SIGMA = 1.0   # AFT scale: log(T) ~ Normal(log(median), SIGMA); refit below from residuals


def p_longer(median, hours, sigma):
    return 1 - norm.cdf((np.log(hours) - np.log(median)) / sigma)


variantsB = {
    "Before the outage: forecast + calendar + trees": EVENT + CAL + FC + TREES,
    "One hour in: + how fast the outage is spreading": EVENT + CAL + FC + TREES + FIRST_HOUR,
}
resB, oofB = {}, {}
for name, cols in variantsB.items():
    cs, maes, aucs4 = [], [], []
    oof_all = np.zeros(len(pos))
    for seed in range(5):
        oof = np.zeros(len(pos))
        for tr, te in folds(pos, seed):
            m = fit_aft(pos.iloc[tr][cols], pos.iloc[tr]["T"])
            oof[te] = pred_aft(m, pos.iloc[te][cols])
        cs.append(concordance(pos["T"], oof))
        maes.append(np.median(np.abs(np.log2(oof) - np.log2(pos["T"]))))
        aucs4.append(roc_auc_score(pos["T"] > 4, oof))
        oof_all += oof / 5
    oofB[name] = oof_all
    resB[name] = {"c_index": round(float(np.mean(cs)), 3), "c_sd": round(float(np.std(cs)), 3),
                  "median_abs_error_factor": round(float(2 ** np.mean(maes)), 2),
                  "auc_dark_over_4h": round(float(np.mean(aucs4)), 3)}
    print(f"B  C={np.mean(cs):.3f} ± {np.std(cs):.3f}  >4h AUC={np.mean(aucs4):.3f}  typical error x{2 ** np.mean(maes):.2f}  {name}")

# spread of real outcomes around the predicted median (one-hour-in model) sets the uncertainty
name1h = "One hour in: + how fast the outage is spreading"
SIGMA = float(np.std(np.log(pos["T"]) - np.log(oofB[name1h])))
# calibration of "P(still dark after 4 h)" in fifths
p4 = p_longer(oofB[name1h], 4, SIGMA)
order = np.argsort(p4)
cal = []
for b in range(5):
    idx = order[b * len(order) // 5:(b + 1) * len(order) // 5]
    cal.append({"predicted": round(float(p4[idx].mean()), 2), "observed": round(float((pos["T"].values[idx] > 4).mean()), 2), "n": int(len(idx))})
print("calibration P(dark > 4h):", cal)

# ── final models on all development data ──
colsA = EVENT + CAL + FC + TREES
mA = xgb.XGBClassifier(**XGB_A).fit(dev[colsA], yA)
colsB_pre = variantsB["Before the outage: forecast + calendar + trees"]
colsB_1h = variantsB[name1h]
mB_pre = fit_aft(pos[colsB_pre], pos["T"])
mB_1h = fit_aft(pos[colsB_1h], pos["T"])
SIGMA_PRE = float(np.std(np.log(pos["T"]) - np.log(oofB["Before the outage: forecast + calendar + trees"])))

# what drives each prediction (TreeSHAP, built into xgboost)
shapA = mA.get_booster().predict(xgb.DMatrix(dev[colsA], missing=np.nan), pred_contribs=True)[:, :-1]
impA = sorted(zip(colsA, np.abs(shapA).mean(0)), key=lambda x: -x[1])
shapB = mB_1h.predict(xgb.DMatrix(pos[colsB_1h], missing=np.nan), pred_contribs=True)[:, :-1]
impB = sorted(zip(colsB_1h, np.abs(shapB).mean(0)), key=lambda x: -x[1])
print("A drivers:", [(k, round(float(v), 3)) for k, v in impA[:6]])
print("B drivers:", [(k, round(float(v), 3)) for k, v in impB[:6]])

# ── THE STORM BACKTEST: December 28-29, 2025, never seen in training ──
BATTERY = 4.0   # Mom's portable oxygen concentrator
storm = []
for r in hold.itertuples():
    row = hold.loc[[r.Index]]
    pA = float(mA.predict_proba(row[colsA])[:, 1][0])
    med_pre = float(pred_aft(mB_pre, row[colsB_pre])[0])
    rec = {"county": r.county, "event": r.event, "onset": r.onset,
           "p_outage_before": round(pA, 3),
           "predicted_dark_hours_before": round(med_pre, 1),
           "p_race_lost_before": round(pA * float(p_longer(med_pre, BATTERY, SIGMA_PRE)), 3),
           "actual_outage": int(r.y_outage), "actual_peak_share": round(float(r.o_peak_share), 3) if r.y_outage else 0,
           "actual_dark_hours": round(float(r.o_home_hours), 1) if r.y_outage else 0}
    if r.y_outage:
        med_1h = float(pred_aft(mB_1h, row[colsB_1h])[0])
        rec["predicted_dark_hours_1h"] = round(med_1h, 1)
        rec["p_dark_over_battery_1h"] = round(float(p_longer(med_1h, BATTERY, SIGMA)), 3)
    storm.append(rec)
storm_df = pd.DataFrame(storm)
print("\nSTORM BACKTEST, Dec 28-29 2025 (held out):")
print(storm_df.to_string(index=False))
# how the held-out storm's counties ranked against everything the model saw
base_rate = float(yA.mean())

report = {
    "rows": int(len(t)), "dev_rows": int(len(dev)), "dev_storms": int(dev.storm.nunique()), "holdout_storm": sorted(HOLDOUT),
    "base_rate_outage": round(base_rate, 3),
    "model_a": resA, "model_b": resB, "sigma_1h": round(SIGMA, 3), "sigma_pre": round(SIGMA_PRE, 3),
    "calibration_dark_over_4h": cal,
    "drivers_a": [[k, round(float(v), 4)] for k, v in impA], "drivers_b": [[k, round(float(v), 4)] for k, v in impB],
    "storm_backtest": storm,
}
json.dump(report, open(os.path.join(OUT, "report.json"), "w"), indent=2)
mA.get_booster().save_model(os.path.join(OUT, "model_a.json"))
mB_pre.save_model(os.path.join(OUT, "model_b_pre.json"))
mB_1h.save_model(os.path.join(OUT, "model_b_1h.json"))
json.dump({"colsA": colsA, "colsB_pre": colsB_pre, "colsB_1h": colsB_1h, "sigma_pre": SIGMA_PRE, "sigma_1h": SIGMA},
          open(os.path.join(OUT, "features.json"), "w"), indent=2)
print("\nwrote ml/out/report.json and models")
