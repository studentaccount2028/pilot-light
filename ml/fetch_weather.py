# AI-assisted: written with Claude Code from the team's forecast spec.
# Downloads hourly weather observations (2019-2025) for the airport weather
# stations (ASOS) in and next to New Hampshire, from the Iowa Environmental
# Mesonet archive. Free, no key. Output: ml/data/asos/<STATION>.csv
#
# Fields: temperature (F), sustained wind and gust (knots), hourly precipitation
# (inches), present-weather codes (FZRA = freezing rain, SN = snow, PL = sleet)
# and the ice accretion sensor where a station has one.
import os
import sys
import time

import requests

# county FIPS -> stations, nearest first. Fryeburg, Maine (IZG) sits beside
# Conway and is the closest station to most of Carroll County.
COUNTY_STATIONS = {
    "33001": ["LCI"],          # Belknap: Laconia
    "33003": ["IZG", "LCI"],   # Carroll: Fryeburg ME, Laconia
    "33005": ["EEN", "AFN"],   # Cheshire: Keene, Jaffrey
    "33007": ["BML", "HIE"],   # Coos: Berlin, Whitefield
    "33009": ["LEB", "1P1"],   # Grafton: Lebanon, Plymouth
    "33011": ["MHT", "ASH"],   # Hillsborough: Manchester, Nashua
    "33013": ["CON"],          # Merrimack: Concord
    "33015": ["PSM", "MHT"],   # Rockingham: Portsmouth, Manchester
    "33017": ["DAW", "PSM"],   # Strafford: Rochester, Portsmouth
    "33019": ["CNH", "LEB"],   # Sullivan: Claremont, Lebanon
}

URL = "https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py"
OUT = os.path.join(os.path.dirname(__file__), "data", "asos")


def fetch(station: str) -> None:
    path = os.path.join(OUT, f"{station}.csv")
    if os.path.exists(path) and os.path.getsize(path) > 10_000:
        print(f"{station}: cached")
        return
    params = {
        "station": station,
        "data": ["tmpf", "sknt", "gust", "p01i", "wxcodes", "ice_accretion_1hr"],
        "year1": 2019, "month1": 1, "day1": 1,
        "year2": 2026, "month2": 1, "day2": 2,
        "tz": "Etc/UTC", "format": "onlycomma", "latlon": "no",
        "missing": "M", "trace": "0.0001", "direct": "no", "report_type": [3, 4],
    }
    for attempt in range(4):
        try:
            r = requests.get(URL, params=params, timeout=300)
            if r.ok and r.text.count("\n") > 100:
                with open(path, "w") as f:
                    f.write(r.text)
                print(f"{station}: {r.text.count(chr(10)):,} rows")
                return
            print(f"{station}: attempt {attempt + 1} got {r.status_code}, {len(r.text)} bytes")
        except requests.RequestException as e:
            print(f"{station}: attempt {attempt + 1} failed: {e}")
        time.sleep(5 * (attempt + 1))
    print(f"{station}: gave up", file=sys.stderr)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for s in sorted({s for ss in COUNTY_STATIONS.values() for s in ss}):
        fetch(s)
