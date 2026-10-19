// AI-assisted: written with Claude Code from the team's build spec.
// The iOS app: a native shell (Capacitor) around the live Pilot Light web app, with native
// notifications, haptics and the status bar. The web app detects it's inside the shell (src/lib/native.ts).
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.pilotlight.app",
  appName: "Pilot Light",
  // shown only if the live app can't load (no connection on first launch)
  webDir: "native/www",
  server: {
    url: process.env.CAP_SERVER_URL ?? "https://pilot-light-jet.vercel.app",
    cleartext: false,
  },
  ios: {
    contentInset: "never",
    backgroundColor: "#08090A",
    scheme: "Pilot Light",
  },
  plugins: {
    SplashScreen: { launchShowDuration: 900, launchAutoHide: true, launchFadeOutDuration: 250, backgroundColor: "#08090A", showSpinner: false },
    LocalNotifications: { iconColor: "#F7F8F8" },
  },
};

export default config;
