/**
 * Shared policy types (docs/system-architecture.md §5 "App policy" row): `can(actor, action,
 * resource)` is a pure function over facts the caller already loaded (a command handler's own
 * transaction read, or a permission-test fixture) — this package has no I/O of its own (docs/
 * system-architecture.md §3), so nothing under packages/domain/src/policy ever queries a database.
 */
import type { ActorVia } from '../commands/envelope';
import type { ErrorCode } from '../errors';

/**
 * `roles` and `via` round out the actor shape every rule file may draw on, even though the crew/
 * trip/plan rules in this phase only ever read `uid`: `roles` is reserved for an admin/back-office
 * rule file, `via` for a rule that cares how the request arrived (e.g. an extension action-key door
 * only allowing a narrow command set). Declaring the full contract now is what lets later phases
 * add rule files without changing every existing call site's actor value.
 */
export interface PolicyActor {
  readonly uid: string;
  readonly isAnonymous: boolean;
  readonly roles: readonly string[];
  readonly via: ActorVia;
}

/** The only codes a policy denial ever carries (docs/api-contracts.md §3; never a 5xx-class code). */
export type PolicyDenialCode = Extract<
  ErrorCode,
  'FORBIDDEN' | 'NOT_FOUND' | 'NOT_ELIGIBLE' | 'STATE_INVALID'
>;

export type PolicyResult = { readonly ok: true } | { readonly ok: false; readonly deny: PolicyDenialCode };

/** A single shared `{ok: true}` value: policy results carry no payload, so one instance suffices. */
export const ALLOW: PolicyResult = { ok: true };

export function deny(code: PolicyDenialCode): PolicyResult {
  return { ok: false, deny: code };
}
