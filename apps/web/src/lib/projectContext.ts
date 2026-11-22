/**
 * The selected project for the Journey-first workspace.
 *
 * One project is "current" per workspace, persisted in localStorage and shared
 * by Journey, Design Studio and the AI Assistant so switching a project once
 * changes the context everywhere. The value is always re-validated against the
 * workspace's project list by the consumer, so a stale id can never leak data
 * from a deleted project or another workspace.
 */

import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'sv-selected-project';

type Stored = { workspaceId: string; projectId: string | null };

let stored: Stored | null = null;
let initialised = false;
const listeners = new Set<() => void>();

function readStored(): Stored | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored;
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.workspaceId !== 'string') return null;
    if (parsed.projectId !== null && typeof parsed.projectId !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

function ensureLoaded() {
  if (initialised) return;
  initialised = true;
  stored = readStored();
}

function emit() {
  for (const listener of listeners) listener();
}

export function getSelectedProjectId(workspaceId: string): string | null {
  ensureLoaded();
  return stored && stored.workspaceId === workspaceId ? stored.projectId : null;
}

export function setSelectedProjectId(workspaceId: string, projectId: string | null) {
  ensureLoaded();
  const next: Stored = { workspaceId, projectId };
  if (stored && stored.workspaceId === next.workspaceId && stored.projectId === next.projectId) return;
  stored = next;
  try {
    if (projectId) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* Storage may be unavailable; the in-memory value still works. */
  }
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** React binding: the selected project id for this workspace, kept in sync across the app. */
export function useSelectedProjectId(workspaceId: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => getSelectedProjectId(workspaceId),
    () => null
  );
}
