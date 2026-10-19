# AI-assisted: written with Claude Code from the team's forecast spec.
# Joins everything into the modelling table: one row per (county, storm event).
#
#   ml/data/storms.csv        outages per event (build_outages.py)
#   ml/data/asos/*.csv        hourly station weather (fetch_weather.py)
#   ml/data/trees_county.csv  roadside tree canopy (build_trees.py)
#
# Two kinds of weather column, kept apart on purpose:
#   fc_*   what the NWS bulletin forecast, known BEFORE the storm
#   obs_*  what the stations recorded during the event, known only as it happens
# Output: ml/data/table.csv
import os

import numpy as np
import pandas as pd

from fetch_weather import COUNTY_STATIONS

HERE = os.path.dirname(__file__)
DATA = os.path.join(HERE, "data")


def load_station(st):
    p = os.path.join(DATA, "asos", f"{st}.csv")
    if not os.path.exists(p) or os.path.getsize(p) < 10_000:
        return None
    d = pd.read_csv(p, na_values=["M"], low_memory=False)
    d["t"] = pd.to_datetime(d["valid"], utc=True)
    for c in ("tmpf", "sknt", "gust", "p01i", "ice_accretion_1hr"):
        d[c] = pd.to_numeric(d[c], errors="coerce")
    d["wxcodes"] = d["wxcodes"].fillna("")
    # hourly bins: the max of each field within the hour (p01i accumulates within an hour)
    d["hour"] = d["t"].dt.floor("h")
    h = d.groupby("hour").agg(tmpf=("tmpf", "mean"), sknt=("sknt", "max"), gust=("gust", "max"), p01i=("p01i", "max"),
                              ice=("ice_accretion_1hr", "max"), wx=("wxcodes", lambda s: " ".join(s)))
    return h


stations = {st: load_station(st) for st in sorted({s for ss in COUNTY_STATIONS.values() for s in ss})}
print("stations with data:", [s for s, v in stations.items() if v is not None])


def weather(fips, t0, t1):
    """Observed storm weather over [t0, t1], from the county's nearest station that has data."""
    for st in COUNTY_STATIONS[fips]:
        h = stations.get(st)
        if h is None:
            continue
        w = h.loc[(h.index >= t0) & (h.index <= t1)]
        if len(w) < 0.5 * max(1, (t1 - t0).total_seconds() / 3600):
            continue
        wind = w["gust"].fillna(w["sknt"])
        wx = w["wx"]
        precip = w["p01i"].fillna(0)
        return {
            "obs_station": st,
            "obs_gust_kt": wind.max(),
            "obs_wind_kt": w["sknt"].max(),
            "obs_precip_in": precip.sum(),
            "obs_frz_hours": wx.str.contains("FZRA|FZDZ").sum(),
            "obs_sleet_hours": wx.str.contains("PL|IP").sum(),
            "obs_snow_hours": (wx.str.contains("SN") & ~wx.str.contains("FZ")).sum(),
            "obs_ice_in": w["ice"].fillna(0).sum(),
            "obs_min_temp_f": w["tmpf"].min(),
            # glaze conditions: precipitation falling with the air near freezing
            "obs_glaze_hours": ((w["tmpf"].between(27, 33)) & (precip > 0)).sum(),
        }
    return {}


if __name__ == "__main__":
    s = pd.read_csv(os.path.join(DATA, "storms.csv"), dtype={"fips": str})
    s["onset_t"] = pd.to_datetime(s["onset_t"], utc=True)
    s["expires_t"] = pd.to_datetime(s["expires_t"], utc=True)
    obs = [weather(r.fips, r.onset_t - pd.Timedelta(hours=1), r.expires_t + pd.Timedelta(hours=6)) for r in s.itertuples()]
    s = pd.concat([s, pd.DataFrame(obs)], axis=1)
    trees = pd.read_csv(os.path.join(DATA, "trees_county.csv"), dtype={"fips": str})
    s = s.merge(trees[["fips", "roadside_canopy_pct", "heavily_treed_share", "road_km"]], on="fips", how="left")
    # calendar and timing features, all known before the storm
    m = (s["month"] - 1) / 12 * 2 * np.pi
    s["month_sin"], s["month_cos"] = np.sin(m), np.cos(m)
    s["night_onset"] = ((s["hour_utc"] >= 2) & (s["hour_utc"] < 14)).astype(int)   # 10 pm to 10 am Eastern-ish
    for e in ["Winter Storm Warning", "High Wind Warning", "Blizzard Warning", "Wind Advisory"]:
        s["ev_" + e.split()[0].lower() + "_" + e.split()[1].lower()] = (s["event"] == e).astype(int)
    s.to_csv(os.path.join(DATA, "table.csv"), index=False)
    print(f"{len(s)} rows; weather found for {s.obs_station.notna().mean():.0%}")
    print(s.groupby("y_outage")[["obs_gust_kt", "obs_glaze_hours", "obs_frz_hours", "obs_precip_in", "roadside_canopy_pct"]].mean().round(2))
