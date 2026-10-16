# Power module: what the firmware sends

The power module is a battery pack with a cellular radio that sits between the wall and the medical device. It reports to Pilot Light over HTTPS. This page is the contract the firmware writes to.

## Pairing

On the household's House tab, **Pair a power module**. Pilot Light shows a token once (`pl_…`). Put it in the firmware. Only its hash is stored, so a lost token means pairing again.

## Sending a report

Either form works. Send one every few minutes, and immediately whenever wall power changes.

**POST JSON** (when the modem can set headers):

```http
POST /api/sensor/report
Authorization: Bearer pl_xxxxxxxx
Content-Type: application/json

{"mains": true, "mains_volts": 121, "charging": true, "battery_pct": 87,
 "capacity_wh": 256, "health_pct": 94, "cycles": 112, "output_watts": 45,
 "battery_volts": 25.6, "temp_c": 23, "signal_dbm": -91}
```

**GET with short names** (for modems that can only fetch a URL, such as an AT `HTTPACTION`):

```
GET /api/sensor/report?t=pl_xxxxxxxx&m=1&v=121&c=1&b=87&wh=256&h=94&cy=112&w=45&bv=25.6&tc=23&rssi=-91
```

The reply is `{"ok":true,"at":"…"}`, or a 4xx with `{"error":"…"}`.

## Fields

Every field is optional; send what the board can measure. The more it sends, the more the app can show.

| Long name | Short | Meaning | Used for |
|---|---|---|---|
| `mains` | `m` | Wall power present, `1`/`0` | "Wall power is on / off" |
| `mains_volts` | `v` | Wall voltage, V | Shown; warns outside 105–130 V |
| `charging` | `c` | The pack is taking a charge, `1`/`0` | Charging / Full / Not charging; warns if the wall is on, the pack is below 95% and not charging |
| `battery_pct` | `b` | State of charge, 0–100 | The big battery figure and the history chart |
| `battery_volts` | `bv` | Pack voltage, V | Shown |
| `capacity_wh` | `wh` | Usable capacity when new, Wh | Time left |
| `health_pct` | `h` | State of health, 0–100 (from a fuel gauge) | Battery health and "replace soon" |
| `cycles` | `cy` | Full charge cycles so far | Replace soon at 500; estimates health if `h` is not sent |
| `output_watts` | `w` | Power going to the medical device, W | Time left at the current draw |
| `temp_c` | `tc` | Pack temperature, °C | Warns at 45 °C |
| `signal_dbm` | `rssi` | Cell signal, dBm | Strong / fair / weak / none |

## How the app reads it

- **Time left** = capacity × health × charge ÷ current draw. A pack at 94% health holds 94% of its label.
- **Replace soon** when health is under 80% or cycles reach 500, the usual end of life for lithium packs. **Replace now** under 70%.
- **Not reporting** after 15 minutes with no report.
- Wall power on → off and back are written to the household's Activity log.

## Without the hardware

`npm run sensor:sim -- normal | outage | worn | fault | clear` writes two hours of simulated readings to a "Demo power module" on the seeded household. Simulated readings are labelled as simulated on screen.

## Not yet wired

A module saying "wall power off" does not yet start the countdown or text anyone. That is the next step: with a module in the house, the outage would no longer need a storm warning plus a silent phone, and the countdown could run from the pack's real charge instead of the backup hours typed into setup.
