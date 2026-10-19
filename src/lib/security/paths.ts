// AI-assisted: written with Claude Code from the team's security plan.
// Where to send someone after signing in. Only a path on this site: "//evil.com" and "/\evil.com"
// would be read by browsers as another site (an open redirect a phishing email could abuse).
export function safeNextPath(next: unknown): string | null {
  if (typeof next !== "string" || next.length > 500) return null;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return null;
  return next;
}
