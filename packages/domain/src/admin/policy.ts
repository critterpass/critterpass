/**
 * Ops-console role policy: which roles may open an area and run a command. The api enforces it on
 * every `/v1/admin/*` read and command; the console uses the same tables to hide what a role cannot
 * do. A command or area missing from these tables is denied to everyone but `owner`.
 */
import { ALLOW, deny, type PolicyResult } from '../policy/types';
import { effectiveAdminRoles, type AdminRole } from './roles';

export const ADMIN_AREAS = [
  'home',
  'catalogue',
  'flags',
  'partners',
  'moderation',
  'support',
  'desk',
  'jobs',
  'feedback',
  'audit',
] as const;
export type AdminArea = (typeof ADMIN_AREAS)[number];

const EVERY_ROLE: readonly AdminRole[] = ['owner', 'ops', 'content', 'support'];

export const ADMIN_AREA_ROLES: Readonly<Record<AdminArea, readonly AdminRole[]>> = {
  home: EVERY_ROLE,
  catalogue: ['content'],
  flags: ['ops'],
  partners: ['ops'],
  moderation: ['ops', 'support'],
  support: ['support'],
  desk: ['ops'],
  jobs: ['ops'],
  feedback: ['support'],
  audit: ['owner', 'ops'],
};

/** Roles allowed to run each admin command (docs/api-contracts.md §4.17). */
export const ADMIN_COMMAND_ROLES: Readonly<Record<string, readonly AdminRole[]>> = {
  set_feature_flag: ['ops'],
  set_partner_adapter: ['ops'],
  upsert_catalogue_item: ['content'],
  upsert_poi: ['content'],
  moderate_item: ['ops', 'support'],
  grant_entitlement: ['support'],
  revoke_entitlement: ['support'],
  revoke_session: ['support'],
  ban_user: ['support'],
  unban_user: ['support'],
  revoke_device_key: ['support'],
  create_concierge_task: ['ops'],
  update_concierge_task: ['ops'],
  set_admin_role: ['owner'],
};

function holdsAny(roles: readonly AdminRole[], allowed: readonly AdminRole[]): boolean {
  const effective = effectiveAdminRoles(roles);
  return allowed.some((role) => effective.includes(role));
}

export function canOpenAdminArea(roles: readonly AdminRole[], area: AdminArea): PolicyResult {
  return holdsAny(roles, ADMIN_AREA_ROLES[area]) ? ALLOW : deny('FORBIDDEN');
}

export function canRunAdminCommand(roles: readonly AdminRole[], command: string): PolicyResult {
  const allowed = ADMIN_COMMAND_ROLES[command] ?? ['owner'];
  return holdsAny(roles, allowed) ? ALLOW : deny('FORBIDDEN');
}

/** The areas a role set may open, in navigation order. */
export function openableAdminAreas(roles: readonly AdminRole[]): readonly AdminArea[] {
  return ADMIN_AREAS.filter((area) => canOpenAdminArea(roles, area).ok);
}
