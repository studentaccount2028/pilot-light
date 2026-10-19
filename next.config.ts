// AI-assisted: written with Claude Code from the team's build spec and security plan.
import type { NextConfig } from "next";

// Content Security Policy: which scripts, styles and servers a page may use. It ships in report-only
// mode first (browsers report violations without blocking), so a missed map or tile host can't break
// the app during an emergency; once the reports are clean, set CSP_ENFORCE=1 to enforce it.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://tiles.openfreemap.org https://router.project-osrm.org https://nominatim.openstreetmap.org https://api.weather.gov",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "report-uri /api/csp-report",
  // only meaningful when enforced (browsers ignore it in report-only mode)
  ...(process.env.CSP_ENFORCE === "1" ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: process.env.CSP_ENFORCE === "1" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only", value: csp },
  // HTTPS only, for two years, including subdomains.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Never send our URLs to other sites: a responder link (/r/<key>) is itself a secret.
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), payment=(), usb=(), geolocation=(self)" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  // The dev-only badge sits on top of the bottom tab bar.
  devIndicators: false,
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Responder, EMS and household pages carry personal information: never cached, never indexed.
      ...["/r/:path*", "/ems/:path*", "/ems", "/town/:path*", "/h/:path*", "/api/:path*"].map((source) => ({
        source,
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      })),
    ];
  },
};

export default nextConfig;
