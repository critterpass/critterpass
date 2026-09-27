/**
 * A generic table-driven state machine: one `Transition[]` array is the single source of truth a
 * TS handler and a hand-written SQL guard trigger both check against (docs/data-model-sync-and-
 * privacy.md §3). `from: null` marks a transition's target as a legal state for a brand new row
 * (an INSERT, not an UPDATE).
 */
import { DomainError } from '../errors';

export interface Transition<Status extends string, Effect extends string = never> {
  readonly from: Status | null;
  readonly to: Status;
  /** Side-effect tags a handler dispatches after the write commits (e.g. `'reveal_flags'`). */
  readonly effects?: readonly Effect[];
}

export interface TransitionResult<Status extends string, Effect extends string = never> {
  readonly to: Status;
  readonly effects: readonly Effect[];
}

export interface StateMachine<Status extends string, Effect extends string = never> {
  /** Legal starting states for a new row. */
  initialStates(): readonly Status[];
  canTransition(from: Status | null, to: Status): boolean;
  /** Throws `DomainError('STATE_INVALID')` for a pair not in the transition table. */
  transition(from: Status | null, to: Status): TransitionResult<Status, Effect>;
}

/** Builds a lookup-table-backed machine from a flat transition list; the list may have duplicates removed by the caller but need not be sorted. */
export function createStateMachine<Status extends string, Effect extends string = never>(
  transitions: readonly Transition<Status, Effect>[],
): StateMachine<Status, Effect> {
  const key = (from: Status | null, to: Status): string => `${from ?? ''}\u0000${to}`;
  const table = new Map<string, readonly Effect[]>();
  const initial = new Set<Status>();

  for (const t of transitions) {
    table.set(key(t.from, t.to), t.effects ?? []);
    if (t.from === null) initial.add(t.to);
  }

  // A write that leaves the status column untouched (other columns changing) is always legal and
  // has no side effects — a structural property of any state machine, not a per-pair rule the
  // transition table needs to spell out. The hand-written SQL guard triggers special-case this
  // identically (`OLD.status = NEW.status THEN RETURN NEW`), which is what keeps the two in sync.
  const isNoOp = (from: Status | null, to: Status): boolean => from !== null && from === to;

  return {
    initialStates: () => [...initial],
    canTransition: (from, to) => isNoOp(from, to) || table.has(key(from, to)),
    transition: (from, to) => {
      if (isNoOp(from, to)) return { to, effects: [] };
      const effects = table.get(key(from, to));
      if (effects === undefined) {
        throw new DomainError('STATE_INVALID', { from, to });
      }
      return { to, effects };
    },
  };
}
