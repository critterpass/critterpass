/**
 * Undo and re-trigger for a disruption's rows.
 *
 * Undo everything walks the rows newest first: a done, reversible plan row is undone through its
 * guide action; a message a vendor already received cannot be unsent, so it gets a compensation
 * draft ("Tell Made: back to 11:40?") that again needs a yes; drafts and pending questions are
 * simply withdrawn. Derived system rows follow the plan by themselves.
 *
 * A re-trigger (the delay changes again) diffs the new version's rows against the old by id: same
 * facts are kept with their state, changed or new rows are re-evaluated, and rows the new version
 * no longer needs are undone (if done) or withdrawn.
 */
import type { DisruptionAction } from '@cp/domain';

export type UndoStep =
  | { readonly step: 'undo_guide_action'; readonly action: DisruptionAction }
  | { readonly step: 'compensate'; readonly action: DisruptionAction; readonly draft: string }
  | { readonly step: 'withdraw'; readonly action: DisruptionAction };

const SENT_STATES: ReadonlySet<string> = new Set(['sent', 'confirmed', 'declined', 'no_answer']);
const OPEN_STATES: ReadonlySet<string> = new Set([
  'planned',
  'needs_yes',
  'draft_ready',
  'waiting_vendor',
]);

/** The message that takes back one a vendor already received, or null when none is needed. */
export function compensationDraft(action: DisruptionAction): string | null {
  if (action.class !== 'vendor' || !SENT_STATES.has(action.state)) return null;
  const vendor = action.facts['vendor'];
  const from = action.facts['from'];
  if (typeof vendor !== 'string' || typeof from !== 'string') return null;
  return `Tell ${vendor}: back to ${from}?`;
}

export function planUndo(actions: readonly DisruptionAction[]): UndoStep[] {
  const steps: UndoStep[] = [];
  for (const action of [...actions].reverse()) {
    if (action.class === 'plan' && action.state === 'done' && action.reversible) {
      steps.push({ step: 'undo_guide_action', action });
      continue;
    }
    const draft = compensationDraft(action);
    if (draft !== null) {
      steps.push({ step: 'compensate', action, draft });
      continue;
    }
    if (OPEN_STATES.has(action.state) && action.class !== 'system') {
      steps.push({ step: 'withdraw', action });
    }
  }
  return steps;
}

export interface ActionDiff {
  /** Unchanged rows, carrying the previous state and ids forward. */
  readonly kept: readonly DisruptionAction[];
  /** New or changed rows to run or ask about afresh. */
  readonly fresh: readonly DisruptionAction[];
  /** Previous rows the new version no longer needs. */
  readonly obsolete: readonly DisruptionAction[];
}

const sameFacts = (a: DisruptionAction, b: DisruptionAction): boolean =>
  JSON.stringify(Object.entries(a.facts).sort()) === JSON.stringify(Object.entries(b.facts).sort());

export function diffActions(
  previous: readonly DisruptionAction[],
  next: readonly DisruptionAction[],
): ActionDiff {
  const before = new Map(previous.map((action) => [action.id, action]));
  const nextIds = new Set(next.map((action) => action.id));
  const kept: DisruptionAction[] = [];
  const fresh: DisruptionAction[] = [];
  const obsolete: DisruptionAction[] = [];
  for (const action of next) {
    const old = before.get(action.id);
    if (old !== undefined && sameFacts(old, action) && old.state !== 'withdrawn') {
      kept.push({ ...action, ...pickState(old) });
    } else {
      fresh.push(action);
      // A changed row that already ran or reached the vendor is taken back first.
      if (old !== undefined && old.state !== 'withdrawn') obsolete.push(old);
    }
  }
  for (const old of previous)
    if (!nextIds.has(old.id) && old.state !== 'withdrawn') obsolete.push(old);
  return { kept, fresh, obsolete };
}

function pickState(old: DisruptionAction): Partial<DisruptionAction> {
  return {
    state: old.state,
    guide_action_id: old.guide_action_id,
    vendor_message_id: old.vendor_message_id,
    decided_by: old.decided_by,
    label: old.label,
  };
}
