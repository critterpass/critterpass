/**
 * The money notification actions (category `cp.money`, docs/api-contracts-async.md §4): each
 * button a payment push carries runs an existing command through `POST /v1/actions` under a device
 * action key scope, so a tap on MARK PAID does exactly what the payment screen's button does.
 * Registration fails fast if a mapped command is missing or its scope does not match.
 */
import type { CommandRegistry } from '../commands/_framework/registry';

export const MONEY_PUSH_ACTIONS = {
  MARK_PAID: { cmd: 'mark_paid', scope: 'money_mark' },
  CONFIRM: { cmd: 'confirm_paid', scope: 'money_mark' },
  NUDGE: { cmd: 'nudge_payment', scope: 'money_nudge' },
} as const;
export type MoneyPushAction = keyof typeof MONEY_PUSH_ACTIONS;

export function assertMoneyPushActions(registry: CommandRegistry): void {
  for (const [action, { cmd, scope }] of Object.entries(MONEY_PUSH_ACTIONS)) {
    const definition = registry.resolve(cmd);
    if (definition?.actionScope !== scope) {
      throw new Error(`cp.money ${action} needs ${cmd} registered with the ${scope} scope`);
    }
  }
}
