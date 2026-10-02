/**
 * Whether one install gets a widget refresh push now (docs/api-contracts-async.md §3.1 `widgets`):
 * pure, so the budget is tested without a database. iOS gives widget reloads a small daily budget,
 * so routine changes are folded: at most one push per debounce window, the rest held for one
 * trailing push when the window ends, and none past the daily cap. A priority change (a vote
 * closing, its tally moving) is sent at once, cap or not.
 */
import { WIDGET_DAILY_CAP, WIDGET_DEBOUNCE_MS } from '@cp/domain';

export interface WidgetPushState {
  readonly priority: boolean;
  readonly now: Date;
  /** Pushes already sent to this install on the current UTC day. */
  readonly sentToday: number;
  /** The install's last routine push, whatever the day. */
  readonly lastRoutineAt: Date | null;
}

export type WidgetPushDecision =
  | { readonly action: 'send' }
  /** Inside the debounce window: one trailing push at `until` covers everything held. */
  | { readonly action: 'defer'; readonly until: Date }
  | { readonly action: 'skip'; readonly reason: 'daily_cap' };

export function decideWidgetPush(state: WidgetPushState): WidgetPushDecision {
  if (state.priority) return { action: 'send' };
  if (state.sentToday >= WIDGET_DAILY_CAP) return { action: 'skip', reason: 'daily_cap' };
  if (state.lastRoutineAt !== null) {
    const until = state.lastRoutineAt.getTime() + WIDGET_DEBOUNCE_MS;
    if (state.now.getTime() < until) return { action: 'defer', until: new Date(until) };
  }
  return { action: 'send' };
}
