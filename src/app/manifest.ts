// AI-assisted: written with Claude Code from the team's build spec.
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pilot Light",
    short_name: "Pilot Light",
    description: "Outage countdown and escalation for medically dependent households.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f5f1",
    theme_color: "#1c1917",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
