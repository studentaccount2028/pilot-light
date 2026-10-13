# Decisions

Dated choices and why. Newest last. "Spec" means the team's build spec of Oct 12, 2026.

## 2026-10-12: Infer the outage from two signals, never one
A storm warning alone only arms the watch. A silent phone alone does nothing. Both together for 20 minutes start the clock. A false alarm costs one text that asks the family to confirm; a miss could cost a life, so the rule leans toward alerting.

## 2026-10-12: Date the outage to the last heartbeat, but never before the warning began
The spec dates the outage to the last heartbeat. We kept that, with one limit: if the phone was already quiet before the warning started, the outage is dated to the warning's onset. A phone that died on Tuesday is not evidence that Thursday's storm cut the power on Tuesday. This also gives every storm its own incident key.

## 2026-10-12: Only the most severe crossed threshold fires
A household with no backup starts at zero. Firing the 6 h, 2 h and 0 h messages together would send three texts in one second, so the engine sends only the 0 h one.

## 2026-10-12: Messages state the time actually left
An outage inferred late can cross the "6 h" threshold with 3.5 hours left. The text says "about 3.5 hours", not "about 6 hours".

## 2026-10-12: Idempotency key includes the channel
The spec's key is (household, outage time, threshold, contact). A contact set to "text and call" gets two deliveries per threshold, so the unique index also includes the channel. The HELP notice and the all-clear use the same table and the same index, which is what limits the all-clear to one per incident.

## 2026-10-12: Insert first, claim, then send
The alert row is inserted before anything is sent; the unique index rejects a second insert from a racing worker. A worker then claims the row with a 30-second lease before calling Twilio, so two workers that both see an undelivered row cannot both send it. A failed send leaves the delivery id empty and the next tick retries, up to 5 times.

## 2026-10-12: After HELP, hold until the phone returns or the warning ends
The spec says HELP resolves the incident. Without a hold, the next tick would see "warning plus silence" and reopen it. The household stays resolved until a heartbeat arrives or the warning expires.

## 2026-10-12: A countdown outlives its warning
If the warning expires while the phone is still silent, the power is probably still out. The countdown keeps running until a heartbeat or a HELP reply.

## 2026-10-12: Never-heard-from households are not monitored
With no heartbeat ever received there is no baseline, so silence means nothing. The status screen says plainly that the household is not being monitored yet.

## 2026-10-12: Only the phone at the house sends heartbeats
A relative opening the status page from another town must not make the house look alive. Heartbeats are off until someone ticks "This phone stays at the house" on that device.

## 2026-10-12: Replay changes inputs and the clock, nothing else
Replay injects an archived warning, rewrites the heartbeat history and speeds up one shared app clock. The rules read "now" from that clock and have no replay branch. Real phone heartbeats for the replayed household are dropped while it runs, because they would cancel the simulated outage. The clock is global, so do not run a replay while real households are being monitored.

## 2026-10-12: The replayed warning is real, its id is ours
api.weather.gov no longer serves alerts from December 2025. The scenario is the real NWS Gray Winter Storm Warning for Southern Carroll County (VTEC KGYX.WS.W.0007, issued 2025-12-28 19:57 UTC), transcribed from the archived bulletin into the shape the live API returns. `seed/replay_ossipee.json` records the source. It was a Winter Storm Warning with up to half an inch of ice, not an Ice Storm Warning, and Ossipee's zone is NHZ006.

## 2026-10-12: The tick runs every 5 seconds, not every minute
Every action is idempotent, so ticking more often is harmless. It makes a 120x replay smooth and sends an all-clear within seconds. `/api/cron/tick` exists for hosts with only a one-minute cron.

## 2026-10-12: Twilio over plain HTTPS, with a simulated mode
Three REST calls and one signature check did not justify a dependency. With no credentials, sends are logged as SIMULATED and nothing leaves the machine, so the whole chain can be tested and run in CI.

## 2026-10-12: No login yet
A household is reached by its unguessable link. `/replay` and the town roster need ADMIN_TOKEN in production. Magic-link login is the next step before real families use it.

## 2026-10-12: Hours are stored as floating point, zone as text
`backup_hours` is double precision rather than numeric so it arrives in code as a number. `nws_zone` is a string; PostGIS is not needed until households are matched to utility territories.

## 2026-10-13: A risk score sets how fast and how wide the ladder goes
Each household gets a score from named factors: cannot leave the house unassisted (+3), no backup power (+3), lives alone (+2), cannot reach the backup (+2), no reply to the storm prompt (+2), age 75 to 84 (+1) or 85 and over (+2), replied ready to the storm prompt (-2). 3 or more is Check, 6 or more is Check first. Two rules override the points: unable to leave and alone is always Check first, and no reply to the prompt is never Stable. Stable keeps the staged ladder. Check sends the first alert as soon as the outage is inferred and includes the town volunteer from the start. Check first alerts everyone at once and leads the message with 911 guidance. The weights are our judgment, not a validated clinical scale, and the People tab shows every factor so a family can see why.

## 2026-10-13: A storm prompt goes to the resident once per warning
When a warning starts, the resident gets one text or call asking whether the backup is charged, plugged in and within reach. YES (or 1) lowers the score and is quoted in the family's alert; HELP (or 2) alerts every contact at once. It is only sent while the phone at the house is still checking in. This is the one message that goes to the senior, and it works on a landline.

## 2026-10-13: The resident profile is four answers and an age
The spec said to store only a device class and a battery figure. The risk score needs more: age (kept as a birth year), lives alone, can leave unassisted, can reach the backup, and a phone number. Every answer is optional and "not sure" scores nothing. No diagnoses or records are stored.

## 2026-10-13: A replayed warning applies only to the replayed household
The archived warning covers seven forecast zones. Without this rule, running the demo would put every real household in those zones on watch and could send them real messages.

## 2026-10-13: Magic-link login, and unowned households stay open by link
A household made while signed in belongs to that account; only that account (or the admin token) can open it. The seeded demo household and any made before login existed have no owner and stay open by their unguessable link, so the demo and the replay keep working. Email goes through Resend when a key is set; without one the link is printed to the server log and, outside production, shown on the page. Heartbeats, Twilio webhooks and the cron route stay unauthenticated: the phone at the house and Twilio hold no session.

## 2026-10-13: The backtest measures cost and notice, not detection
Ten winters of archived NWS warnings for all 15 NH zones (794 warnings) give how often a watch arms and how much notice the storm prompt gets. They cannot say whether an outage would have been caught, because the archive has no outages in it. The DOE EAGLE-I county outage records (15-minute counts) are the ground truth for that and are being pulled for New Hampshire; the join is the next step and the training data for an outage-risk model. There were no Ice Storm Warnings in NH in those ten years: NWS Gray issues Winter Storm Warnings for ice, which is why the engine's filter keeps that event.

## 2026-10-13: The address must be in New Hampshire
Everything the app knows (warnings, town outlines, fire and hospital sites) is NH data, so an address that geocodes out of state is refused rather than saved with nothing around it. The Town box is part of the lookup, and a street the map does not know falls back to the town centre and says so.

## 2026-10-13: Wind Advisory arms the watch; prompts stay with warnings
Joining ten winters of NWS events to three years of DOE EAGLE-I county outages showed the four-warning arming set was armed for 44% of outages hitting 10% of a county. Adding Wind Advisory raised that to 58% (and 81% of those hitting 25%) for 190 instead of 106 hours on watch per county per year. Winter Weather Advisory added little for much more watch time, so it stays out. The resident's storm prompt is sent only for warnings, so prompt load is unchanged at about five a winter. Numbers in docs/backtest.md.
