/**
 * Ops-console role policy: which roles may open an area and run a command. The api enforces it on
 * every `/v1/admin/*` read and command; the console uses the same tables to hide what a role cannot
 * do. A command or area missing from these tables is denied to everyone but `owner`.
 */
import { ALLOW, deny, type PolicyResult } from '../policy/types';
import { effectiveAdminRoles, type AdminRole } from './roles';

export const ADMIN_AREAS = [
  'home',
  'work',
  'catalogue',
  'content',
  'flags',
  'partners',
  'moderation',
  'support',
  'desk',
  'jobs',
  'feedback',
  'billing',
  'community',
  'services',
  'audit',
  'operators',
] as const;
export type AdminArea = (typeof ADMIN_AREAS)[number];

const EVERY_ROLE: readonly AdminRole[] = ['owner', 'ops', 'content', 'support'];

export const ADMIN_AREA_ROLES: Readonly<Record<AdminArea, readonly AdminRole[]>> = {
  home: EVERY_ROLE,
  work: EVERY_ROLE,
  catalogue: ['content'],
  content: ['content'],
  flags: ['ops'],
  partners: ['ops'],
  moderation: ['ops', 'support'],
  support: ['support'],
  desk: ['ops'],
  jobs: ['ops'],
  feedback: ['support'],
  billing: ['support'],
  community: ['ops', 'content'],
  services: ['ops'],
  audit: ['owner', 'ops'],
  operators: ['owner'],
};

/** Roles allowed to run each admin command (docs/api-contracts.md §4.17). */
export const ADMIN_COMMAND_ROLES: Readonly<Record<string, readonly AdminRole[]>> = {
  set_feature_flag: ['ops'],
  set_partner_adapter: ['ops'],
  upsert_catalogue_item: ['content'],
  upsert_poi: ['content'],
  upsert_season_editorial: ['content'],
  review_season_event: ['content'],
  review_cost_index: ['content'],
  review_content_item: ['content'],
  reject_content_batch: ['content'],
  verify_poi_hours: ['content'],
  approve_content_batch: ['owner'],
  rollback_content_release: ['owner'],
  moderate_item: ['ops', 'support'],
  set_idea_status: ['support'],
  set_feedback_status: ['support'],
  merge_feedback_into_idea: ['support'],
  grant_entitlement: ['support'],
  revoke_entitlement: ['support'],
  revoke_session: ['support'],
  revoke_all_sessions: ['support'],
  ban_user: ['support'],
  unban_user: ['support'],
  revoke_device_key: ['support'],
  create_concierge_task: ['ops'],
  update_concierge_task: ['ops'],
  send_vendor_message: ['ops'],
  set_vendor_contact: ['ops'],
  propose_vendor_reply: ['ops'],
  set_admin_role: ['owner'],
  revoke_admin_sessions: ['owner'],
  claim_work_item: EVERY_ROLE,
  release_work_item: EVERY_ROLE,
  redrive_jobs: ['ops'],
  replay_webhook: ['ops'],
  record_offer_code_batch: ['support'],
  review_ftf_grant: ['support'],
  grant_trip_boost: ['support'],
  extend_store_renewal: ['support'],
  post_incident: ['ops'],
  update_incident: ['ops'],
  resolve_incident: ['ops'],
  set_vendor_cost: ['owner'],
  force_purge_account: ['owner'],
  admin_unpublish_shared_plan: ['ops'],
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

/** A config key's own roles narrow `set_feature_flag` (tier switches and spend caps: owner). */
export function canSetConfigKey(
  roles: readonly AdminRole[],
  keyRoles: readonly AdminRole[] | undefined,
): PolicyResult {
  if (!canRunAdminCommand(roles, 'set_feature_flag').ok) return deny('FORBIDDEN');
  return keyRoles === undefined || holdsAny(roles, keyRoles) ? ALLOW : deny('FORBIDDEN');
}

/** The areas a role set may open, in navigation order. */
export function openableAdminAreas(roles: readonly AdminRole[]): readonly AdminArea[] {
  return ADMIN_AREAS.filter((area) => canOpenAdminArea(roles, area).ok);
}
