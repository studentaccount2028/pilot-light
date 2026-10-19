// AI-assisted: written with Claude Code from the team's security plan.
// Time-based one-time passwords (RFC 6238), the 6-digit codes from an authenticator app
// (Google Authenticator, 1Password, Authy). Staff accounts need one to see lockbox codes:
// a stolen email inbox alone is no longer enough.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const STEP_SECONDS = 30;

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error("Invalid base32.");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const newTotpSecret = () => base32Encode(randomBytes(20));

// The code for one 30-second step.
export function totpAt(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = mac[mac.length - 1] & 15;
  const n = (mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(n).padStart(6, "0");
}

export const stepOf = (ms: number) => Math.floor(ms / 1000 / STEP_SECONDS);

// Accepts the current step and one either side (clock drift). Returns the matched step so the caller
// can refuse a code that was already used (no replays), or null.
export function verifyTotp(secret: string, code: string, nowMs = Date.now(), lastUsedStep: number | null = null): number | null {
  const given = String(code).replace(/\s/g, "");
  if (!/^\d{6}$/.test(given)) return null;
  const now = stepOf(nowMs);
  for (const step of [now - 1, now, now + 1]) {
    if (lastUsedStep != null && step <= lastUsedStep) continue;
    const want = totpAt(secret, step);
    if (timingSafeEqual(Buffer.from(want), Buffer.from(given))) return step;
  }
  return null;
}

export function otpauthUri(email: string, secret: string): string {
  const label = encodeURIComponent(`Pilot Light:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent("Pilot Light")}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
}
