# The iOS app

Pilot Light ships as a native iOS app built with [Capacitor](https://capacitorjs.com): a native shell around the live web app (`capacitor.config.ts`), with native features the web can't do on its own.

| Native feature | Where | What it does |
|---|---|---|
| Scheduled backup alerts | `src/lib/native.ts` → `scheduleBackupAlerts`, called from `HouseholdView` | When a countdown starts, the phone schedules its own notifications for 2 hours left and for zero. They fire even if the app is closed or the phone is offline. |
| Haptics | `tap()`, called from `ResponderView` | A firm tap on "On my way" / "I'm here"; a warning buzz on "Need help". |
| Status bar and launch screen | `startNative()` via `NativeBridge` | Dark status bar over the app's black, logo launch screen, one-time permission prompt for alerts. |
| Offline screen | `native/www/index.html` | Shown if the app can't reach the server on first launch. |

On the plain web every function in `src/lib/native.ts` does nothing, so the website is unchanged.

## Run it on an iPhone (free, no developer account)

1. `npm install`, then `npm run ios:sync` and `npm run ios:open` (opens Xcode).
2. In Xcode, select the **App** target → **Signing & Capabilities** → **Team** → add your Apple ID (a free "Personal Team" works). If Xcode says the bundle ID is taken, change it to something unique, like `com.yourname.pilotlight`.
3. Plug in the iPhone. On the phone: **Settings → Privacy & Security → Developer Mode → On** (it restarts).
4. Pick the iPhone at the top of Xcode and press **Run** (▶).
5. First launch only: **Settings → General → VPN & Device Management** → trust your Apple ID.

With a free Apple ID the app stays installed for 7 days; press Run again to renew.

## Notes

- The native features turn on once the web code containing `src/lib/native.ts` is deployed (the app loads the live site). Until then the app runs the current site.
- To point the app at a different server (e.g. a local dev server on your Wi-Fi): `CAP_SERVER_URL=http://192.168.x.x:3000 npm run ios:sync`.
- App Store or TestFlight needs the Apple Developer Program ($99/year). For alerts sent by the server (not just scheduled on the phone), add push notifications (APNs) at that point.
