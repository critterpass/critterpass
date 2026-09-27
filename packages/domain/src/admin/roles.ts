/**
 * Ops-console roles (docs/api-contracts.md §4.17). Better Auth's `admin` plugin stores a user's roles
 * as one comma-separated `auth.user.role` string; this module is the only place that string is read.
 *
 * - `owner`: everything, plus role management and audit export.
 * - `ops`: moderation, flags, the concierge desk, partner adapters, job redrive.
 * - `content`: catalogue, content batches, POIs.
 * - `support`: users, sessions, entitlement grants, deletion status, feedback and ideas.
 */
import { z } from 'zod';

export const ADMIN_ROLES = ['owner', 'ops', 'content', 'support'] as const;
export const adminRoleSchema = z.enum(ADMIN_ROLES);
export type AdminRole = z.infer<typeof adminRoleSchema>;

function isAdminRole(value: string): value is AdminRole {
  return (ADMIN_ROLES as readonly string[]).includes(value);
}

/** Known roles in `auth.user.role`, deduplicated, in canonical order; unknown entries are ignored. */
export function parseAdminRoles(stored: string | null | undefined): readonly AdminRole[] {
  if (stored === null || stored === undefined) return [];
  const present = new Set(
    stored
      .split(',')
      .map((part) => part.trim())
      .filter(isAdminRole),
  );
  return ADMIN_ROLES.filter((role) => present.has(role));
}

/** The roles a holder acts with: `owner` implies every other role. */
export function effectiveAdminRoles(roles: readonly AdminRole[]): readonly AdminRole[] {
  return roles.includes('owner') ? ADMIN_ROLES : roles;
}

export function serializeAdminRoles(roles: readonly AdminRole[]): string {
  return ADMIN_ROLES.filter((role) => roles.includes(role)).join(',');
}
