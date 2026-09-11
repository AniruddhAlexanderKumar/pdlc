import { type Algorithm, hash, verify } from "@node-rs/argon2";

/**
 * Password hashing. Server-only — never import from a client component.
 *
 * Argon2id via @node-rs/argon2 (a Rust implementation running in our own
 * process; no password ever leaves this application). Parameters follow the
 * OWASP Password Storage Cheat Sheet's Argon2id recommendation of 19 MiB /
 * t=2 / p=1. The salt is generated per hash by the library and encoded in the
 * returned PHC string, so the algorithm and its parameters travel with the
 * hash and can be raised later without invalidating existing passwords.
 */
/**
 * `Algorithm.Argon2id`. The package declares `Algorithm` as an ambient const
 * enum, which `isolatedModules` forbids importing as a value, so the member
 * is written out and typed instead.
 */
const ARGON2ID = 2 as Algorithm;

const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

/**
 * Verifies a password against a stored hash.
 *
 * Returns false rather than throwing on a malformed or unrecognised hash: a
 * corrupt credential row is an authentication failure, not a 500 that tells
 * an attacker something went unusually wrong.
 */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}
