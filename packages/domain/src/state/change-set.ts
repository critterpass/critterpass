/**
 * ChangeSet state machine (docs/data-model-sync-and-privacy.md §3.6, docs/data-model.md §3.3):
 * `draft → proposed → voting → approved → applied`, `proposed|voting → rejected`,
 * `applied → reverted`. `stale` is reachable from any non-terminal status (the base version was
 * superseded while this change set was still pending) so it is handled as a standing rule rather
 * than one row per status in the transition table.
 */
import { DomainError } from '../errors';
import { type ChangeSetApprovedByKind, type ChangeSetStatus } from '../enums/plan';
import { type StateMachine, type Transition, createStateMachine } from './machine';

const CHANGE_SET_TRANSITIONS: readonly Transition<ChangeSetStatus>[] = [
  { from: null, to: 'draft' },
  { from: 'draft', to: 'proposed' },
  { from: 'proposed', to: 'voting' },
  { from: 'proposed', to: 'approved' },
  { from: 'proposed', to: 'rejected' },
  { from: 'voting', to: 'approved' },
  { from: 'voting', to: 'rejected' },
  { from: 'approved', to: 'applied' },
  { from: 'applied', to: 'reverted' },
];

const TERMINAL_STATUSES: ReadonlySet<ChangeSetStatus> = new Set([
  'applied',
  'rejected',
  'reverted',
  'stale',
]);

export const changeSetStateMachine: StateMachine<ChangeSetStatus> =
  createStateMachine(CHANGE_SET_TRANSITIONS);

export function canGoStale(from: ChangeSetStatus): boolean {
  return !TERMINAL_STATUSES.has(from);
}

export function canTransitionChangeSet(from: ChangeSetStatus | null, to: ChangeSetStatus): boolean {
  if (to === 'stale') return from !== null && canGoStale(from);
  return changeSetStateMachine.canTransition(from, to);
}

/** Throws `DomainError('STATE_INVALID')` for a pair neither the table nor the stale rule allows. */
export function transitionChangeSet(
  from: ChangeSetStatus | null,
  to: ChangeSetStatus,
): ChangeSetStatus {
  if (!canTransitionChangeSet(from, to)) {
    throw new DomainError('STATE_INVALID', { from, to });
  }
  return to;
}

/**
 * `approved_by_kind: 'policy'` means a system rule decided (never a human), so only the system
 * actor may write it — mirrors the `app.change_sets_guard` SQL trigger's own check on `app.uid()`.
 */
export function assertApprovedByKindAllowed(
  approvedByKind: ChangeSetApprovedByKind | null,
  isSystemActor: boolean,
): void {
  if (approvedByKind === 'policy' && !isSystemActor) {
    throw new DomainError('FORBIDDEN', { approvedByKind });
  }
}
