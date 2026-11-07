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

/**
 * A hash of no real password, computed once per process and reused —
 * not a credential, a stand-in used only to make {@link verifyPasswordSafely}
 * spend the same CPU time whether or not an account exists.
 */
let decoyHash: Promise<string> | undefined;

function getDecoyHash(): Promise<string> {
  decoyHash ??= hashPassword(`decoy-${Math.random()}`);
  return decoyHash;
}

/**
 * Verifies a password when the account might not exist, in constant time
 * with respect to that fact.
 *
 * `signIn` used to call `verifyPassword` only when a credential row was
 * found, which meant a request for an email with no account returned in
 * however long a database lookup takes, while a request for a real email
 * with the wrong password additionally waited for a full Argon2id
 * computation — tens of milliseconds, an easily-measurable gap that turns
 * the sign-in endpoint into a username-enumeration oracle despite both
 * responses carrying the identical generic error message. This always runs
 * the same Argon2id verification, against the real hash when one exists and
 * against a fixed decoy otherwise, so both cases cost the same CPU time.
 * Returns `false` unconditionally when `passwordHash` is `undefined` — the
 * decoy is never a hash any real password could match.
 */
export async function verifyPasswordSafely(
  passwordHash: string | undefined,
  password: string,
): Promise<boolean> {
  const target = passwordHash ?? (await getDecoyHash());
  const matched = await verifyPassword(target, password);
  return passwordHash !== undefined && matched;
}
