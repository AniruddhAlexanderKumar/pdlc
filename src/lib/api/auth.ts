"use client";

import type { AuthenticatedIdentity, SignInRequest, SignUpRequest } from "@/domain";
import { ApiError, requestJson } from "./client";

/**
 * Browser-side authentication calls.
 *
 * The session token is never handled here: it travels only as an HttpOnly
 * cookie set by the server, so no script — ours or an attacker's — can read
 * it. Nothing is stored in localStorage, sessionStorage or React state.
 */

async function postAuth<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    // Same-origin: the browser attaches the session cookie automatically.
    credentials: "same-origin",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const envelope = (payload ?? {}) as { error?: { code?: string; message?: string } };
    throw new ApiError(
      envelope.error?.message ?? "The request failed.",
      response.status,
      envelope.error?.code ?? "INTERNAL_ERROR",
    );
  }

  return payload as T;
}

export async function signUp(input: SignUpRequest): Promise<AuthenticatedIdentity> {
  return postAuth<AuthenticatedIdentity>("/api/auth/sign-up", input);
}

export async function signIn(input: SignInRequest): Promise<AuthenticatedIdentity> {
  return postAuth<AuthenticatedIdentity>("/api/auth/sign-in", input);
}

export async function signOut(): Promise<void> {
  await postAuth<{ signedOut: boolean }>("/api/auth/sign-out");
}

/** Current identity, or null when unauthenticated. */
export async function fetchIdentity(): Promise<AuthenticatedIdentity | null> {
  return requestJson<AuthenticatedIdentity | null>("/api/auth/session", "identity");
}
