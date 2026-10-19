// AI-assisted: written with Claude Code from the team's security plan.
// Field-level encryption for the most sensitive things Pilot Light stores: how to get into a house
// (door, key location, lockbox code). AES-256-GCM, so a stolen database dump or backup is useless
// without the key, and any tampering is detected.
//
// FIELD_ENCRYPTION_KEY: 32 random bytes, base64 (make one with `openssl rand -base64 32`).
// Stored values look like "enc:v1:<iv>.<tag>.<ciphertext>" (base64url). Values written before
// encryption was turned on are plain text and are still read; they're encrypted on their next save.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";

function key(): Buffer | null {
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (!raw) {
    if (process.env.NODE_ENV === "production") throw new Error("FIELD_ENCRYPTION_KEY is not set.");
    return null; // local development without a key: stored as plain text
  }
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("FIELD_ENCRYPTION_KEY must be 32 bytes, base64-encoded.");
  return k;
}

export function isSealed(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

// Encrypt before writing to the database.
export function seal(plain: string | null): string | null {
  if (plain == null) return null;
  const k = key();
  if (!k) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + [iv, cipher.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}

// Decrypt after reading from the database. Plain (legacy) values pass through.
export function open(stored: string | null): string | null {
  if (stored == null || !isSealed(stored)) return stored;
  const k = key();
  if (!k) throw new Error("This value is encrypted but FIELD_ENCRYPTION_KEY is not set.");
  const [iv, tag, body] = stored.slice(PREFIX.length).split(".").map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", k, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}
