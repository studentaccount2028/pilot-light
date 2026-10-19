# AI-assisted: written with Claude Code from the team's forecast spec.
# A time-honest test of "during the storm" prediction.
#
# train.py's storm-weather model scores 0.73, but it reads the weather over the whole
# event window, some of which falls after the outage began. That is a severity
# description, not a forecast. Here the model only sees weather up to a cutoff
# (onset + H hours), and is only asked about outages that had NOT started by then.
# If it still beats the before-the-storm model, live weather is genuinely useful.
import os

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from build_features import weather

HERE = os.path.dirname(__file__)
t = pd.read_csv(os.path.join(HERE, "data", "table.csv"), dtype={"fips": str})
t["onset_t"] = pd.to_datetime(t["onset_t"], utc=True)
t["o_ep_start"] = pd.to_datetime(t["o_ep_start"], utc=True)
HOLDOUT = ["2025-12-28", "2025-12-29", "2025-12-30"]
EVENT = [c for c in t.columns if c.startswith("ev_")]
BASE = EVENT + ["duration_hours", "month_sin", "month_cos", "night_onset", "fc_iceIn", "fc_snowIn", "fc_gustMph",
                "roadside_canopy_pct", "heavily_treed_share"]


def folds(d, seed, k=5):
    storms = d.storm.unique()
    perm = {s: i for i, s in enumerate(np.random.default_rng(seed).permutation(storms))}
    return list(GroupKFold(n_splits=k).split(d, groups=d.storm.map(perm).values))


def cv(make, X, y, d):
    aucs = []
    for seed in range(5):
        oof = np.zeros(len(y))
        for tr, te in folds(d, seed):
            oof[te] = make().fit(X.iloc[tr], y.iloc[tr]).predict_proba(X.iloc[te])[:, 1]
        aucs.append(roc_auc_score(y, oof))
    return np.mean(aucs), np.std(aucs)


for H in (2, 4, 6):
    d = t[~t.storm.isin(HOLDOUT)].copy()
    cutoff = d.onset_t + pd.Timedelta(hours=H)
    # only events where no outage had begun by the cutoff: the question is still open
    d = d[(d.y_outage == 0) | (d.o_ep_start > cutoff)].copy()
    w = pd.DataFrame([weather(r.fips, r.onset_t - pd.Timedelta(hours=1), r.onset_t + pd.Timedelta(hours=H)) for r in d.itertuples()],
                     index=d.index).add_prefix("now_")
    now = [c for c in w.columns if c not in ("now_obs_station",)]
    d = pd.concat([d, w], axis=1)
    y = d.y_outage
    shallow = dict(objective="binary:logistic", max_depth=2, learning_rate=0.03, n_estimators=300, subsample=0.8,
                   colsample_bytree=0.8, min_child_weight=10, reg_lambda=10.0)
    a0 = cv(lambda: make_pipeline(StandardScaler(), LogisticRegression(C=0.5, max_iter=2000)), d[BASE].fillna(0), y, d)
    a1 = cv(lambda: xgb.XGBClassifier(**shallow), d[BASE], y, d)
    a2 = cv(lambda: xgb.XGBClassifier(**shallow), d[BASE + now], y, d)
    print(f"{H} h into the warning ({len(d)} open events, {y.mean():.0%} later had an outage): "
          f"before-storm logistic {a0[0]:.3f}±{a0[1]:.3f} | before-storm trees {a1[0]:.3f}±{a1[1]:.3f} | "
          f"+ weather so far {a2[0]:.3f}±{a2[1]:.3f}")
