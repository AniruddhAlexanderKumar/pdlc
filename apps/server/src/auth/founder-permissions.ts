import type { FounderRole } from '../db/schema.js';

// These are policy primitives, not authentication middleware. Nothing is granted
// unless a future server-side session loader has first verified the active founder.
export type FounderPermission = 'founder.security.manage' | 'founder.roles.manage' | 'platform.accounts.manage' | 'platform.configuration.manage' | 'platform.operations.read';

const permissions: Readonly<Record<FounderRole, readonly FounderPermission[]>> = {
  owner: ['founder.security.manage', 'founder.roles.manage', 'platform.accounts.manage', 'platform.configuration.manage', 'platform.operations.read'],
  admin: ['platform.accounts.manage', 'platform.configuration.manage', 'platform.operations.read'],
  operations: ['platform.operations.read']
};

export function founderHasPermission(role: string, permission: string): boolean {
  return Object.hasOwn(permissions, role) && permissions[role as FounderRole].some((value) => value === permission);
}

/** A self-role change is forbidden even for an owner. Authentication and
 * transactional checks of actor/target status must still be done by the caller. */
export function mayChangeFounderRole(actorId: string, actorRole: string, targetId: string): boolean {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuid.test(actorId) && uuid.test(targetId) && actorId.toLowerCase() !== targetId.toLowerCase() && founderHasPermission(actorRole, 'founder.roles.manage');
}
