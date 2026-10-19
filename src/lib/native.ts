// AI-assisted: written with Claude Code from the team's build spec.
// Native features when the web app runs inside the iOS app (capacitor.config.ts). On the plain web
// every function here is a no-op, so callers don't need to check.
import { Capacitor } from "@capacitor/core";

export const isNative = () => Capacitor.isNativePlatform();

// Stable notification ids per household: 2 h warning and zero.
function idsFor(householdId: string): [number, number] {
  let h = 0;
  for (const c of householdId) h = (h * 31 + c.charCodeAt(0)) | 0;
  const base = (Math.abs(h) % 100_000) * 10;
  return [base + 1, base + 2];
}

// Schedule the phone's own reminders for this household's countdown, so they go off even with the app
// closed or the phone offline: one at 2 hours of backup left, one when it reaches zero. Any earlier pair
// for the house is replaced; passing no zero time (countdown over) just clears them.
export async function scheduleBackupAlerts(householdId: string, label: string, zeroAt: string | null): Promise<void> {
  if (!isNative()) return;
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  const [twoHourId, zeroId] = idsFor(householdId);
  await LocalNotifications.cancel({ notifications: [{ id: twoHourId }, { id: zeroId }] }).catch(() => {});
  if (!zeroAt) return;
  const zero = Date.parse(zeroAt);
  const now = Date.now();
  const notifications = [
    { id: twoHourId, at: zero - 2 * 3_600_000, title: `${label}: 2 hours of backup left`, body: "Has someone checked in? Open Pilot Light to see who's on the way." },
    { id: zeroId, at: zero, title: `${label}: backup has likely run out`, body: "If no one has reached the house, call 911." },
  ]
    .filter((n) => n.at > now + 5_000)
    .map((n) => ({ id: n.id, title: n.title, body: n.body, schedule: { at: new Date(n.at), allowWhileIdle: true }, extra: { householdId } }));
  if (notifications.length) await LocalNotifications.schedule({ notifications }).catch(() => {});
}

// A firm tap for actions that tell other people something (on my way, I'm here, help).
export async function tap(kind: "action" | "warning" = "action"): Promise<void> {
  if (!isNative()) return;
  const { Haptics, ImpactStyle, NotificationType } = await import("@capacitor/haptics");
  if (kind === "warning") await Haptics.notification({ type: NotificationType.Warning }).catch(() => {});
  else await Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
}

// One-time setup when the app starts: dark status bar over the app's black, hide the launch screen once
// the page is up, and ask once for permission to show alerts.
export async function startNative(): Promise<void> {
  if (!isNative()) return;
  const [{ StatusBar, Style }, { SplashScreen }, { LocalNotifications }] = await Promise.all([
    import("@capacitor/status-bar"),
    import("@capacitor/splash-screen"),
    import("@capacitor/local-notifications"),
  ]);
  await StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  await SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => {});
  const perm = await LocalNotifications.checkPermissions().catch(() => null);
  if (perm?.display === "prompt") await LocalNotifications.requestPermissions().catch(() => {});
}
