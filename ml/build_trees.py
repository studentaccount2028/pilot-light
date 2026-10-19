# AI-assisted: written with Claude Code from the team's forecast spec.
# How much tree canopy lines the roads, where New Hampshire's distribution lines
# mostly run. Trees on lines are the leading cause of storm outages in New England.
#
# Roads: OpenStreetMap (primary down to unclassified rural roads), via Overpass.
# Canopy: USFS / NLCD Tree Canopy Cover 2021 (percent canopy per ~30 m cell),
#         fetched for New Hampshire by ml/data/canopy/tcc_nh.tif.
# Output: ml/data/trees_county.csv and ml/data/trees_town.csv
import json
import math
import os

import numpy as np
import pandas as pd
import rasterio
import requests
from shapely.geometry import Point, shape
from shapely.strtree import STRtree

HERE = os.path.dirname(__file__)
ROOT = os.path.join(HERE, "..")
DATA = os.path.join(HERE, "data")
STEP_M = 150          # sample a point every 150 m of road
HEAVY = 60            # a road point is "heavily treed" at 60%+ canopy


def roads():
    cache = os.path.join(DATA, "canopy", "roads_nh.json")
    if os.path.exists(cache):
        return json.load(open(cache))
    q = """[out:json][timeout:300];
    area["ISO3166-2"="US-NH"][admin_level=4]->.nh;
    way(area.nh)[highway~"^(primary|secondary|tertiary|unclassified)$"];
    out geom;"""
    # the public Overpass servers are often busy; try the main one, then the mirrors
    mirrors = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter",
               "https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass.private.coffee/api/interpreter"]
    d = None
    for url in mirrors * 2:
        try:
            r = requests.post(url, data={"data": q}, timeout=400,
                              headers={"User-Agent": "pilot-light-forecast (Congressional App Challenge student project)"})
            if r.ok:
                d = r.json()
                break
            print(f"  {url}: {r.status_code}")
        except requests.RequestException as e:
            print(f"  {url}: {e}")
    if d is None:
        raise SystemExit("no Overpass server answered")
    json.dump(d, open(cache, "w"))
    return d


def sample(ways):
    """Points every STEP_M metres along each road (equirectangular distance is fine at this scale)."""
    pts = []
    for w in ways["elements"]:
        g = w.get("geometry") or []
        carry = 0.0
        for a, b in zip(g, g[1:]):
            lat0 = math.radians((a["lat"] + b["lat"]) / 2)
            dx = (b["lon"] - a["lon"]) * 111_320 * math.cos(lat0)
            dy = (b["lat"] - a["lat"]) * 110_540
            seg = math.hypot(dx, dy)
            d = STEP_M - carry
            while d <= seg:
                f = d / seg
                pts.append((a["lon"] + f * (b["lon"] - a["lon"]), a["lat"] + f * (b["lat"] - a["lat"]), w["tags"].get("highway")))
                d += STEP_M
            carry = (carry + seg) % STEP_M
    return pts


if __name__ == "__main__":
    ways = roads()
    pts = sample(ways)
    print(f"{len(ways['elements']):,} road segments -> {len(pts):,} sample points every {STEP_M} m")

    towns = json.load(open(os.path.join(ROOT, "public", "data", "nh_towns.geojson")))
    polys = [shape(f["geometry"]) for f in towns["features"]]
    tree = STRtree(polys)
    meta = [(f["properties"]["name"], f"330{f['properties']['county']:02d}") for f in towns["features"]]

    with rasterio.open(os.path.join(DATA, "canopy", "tcc_nh.tif")) as src:
        arr = src.read(1)
        rows, cols = rasterio.transform.rowcol(src.transform, [p[0] for p in pts], [p[1] for p in pts])
    rows, cols = np.clip(rows, 0, arr.shape[0] - 1), np.clip(cols, 0, arr.shape[1] - 1)
    canopy = arr[rows, cols].astype(float)
    canopy[canopy > 100] = np.nan

    recs = []
    for (lon, lat, hw), c in zip(pts, canopy):
        hit = tree.query(Point(lon, lat), predicate="within")
        if len(hit) and not np.isnan(c):
            name, fips = meta[hit[0]]
            recs.append({"town": name, "fips": fips, "highway": hw, "canopy": c})
    df = pd.DataFrame(recs)
    agg = lambda g: pd.Series({
        "road_points": len(g),
        "road_km": len(g) * STEP_M / 1000,
        "roadside_canopy_pct": g.canopy.mean(),
        "heavily_treed_share": (g.canopy >= HEAVY).mean(),
    })
    county = df.groupby("fips").apply(agg).reset_index()
    town = df.groupby(["town", "fips"]).apply(agg).reset_index()
    county.to_csv(os.path.join(DATA, "trees_county.csv"), index=False)
    town.to_csv(os.path.join(DATA, "trees_town.csv"), index=False)
    names = {"33001": "Belknap", "33003": "Carroll", "33005": "Cheshire", "33007": "Coos", "33009": "Grafton",
             "33011": "Hillsborough", "33013": "Merrimack", "33015": "Rockingham", "33017": "Strafford", "33019": "Sullivan"}
    county["county"] = county.fips.map(names)
    print(county.sort_values("roadside_canopy_pct", ascending=False).round(2).to_string(index=False))
    print(town[town.town.str.contains("Ossipee")].round(2).to_string(index=False))
