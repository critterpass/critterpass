/**
 * What each settle-up action says once its command answers. Requests, nudges, confirms, disputes
 * and reminders are online only: with no signal they say so, and "already nudged today" or "already
 * reminded today" is said only when the server refuses for that reason. Marking paid may wait in
 * the offline queue, so a queued mark counts as done.
 */
import { useLingui } from '@lingui/react/macro';

import type { CommandFeedbackCopy } from '@/motion/island-toast';

export type SettleAction = 'markPaid' | 'request' | 'nudge' | 'confirm' | 'dispute' | 'remind';

/** The copy for an action; `who` is the other person's first name where the line names them. */
export function useSettleCopy(): (action: SettleAction, who?: string) => CommandFeedbackCopy {
  const { t } = useLingui();
  return (action, who = '') => {
    switch (action) {
      case 'markPaid':
        return {
          id: 'money-payment',
          offlineCapable: true,
          done: t({ id: 'money.pay.marked', message: 'Marked paid. They confirm when it lands.' }),
        };
      case 'request':
        return {
          id: 'money-payment',
          done: t({ id: 'money.pay.requested', message: `Asked ${who} to pay.` }),
        };
      case 'nudge':
        return {
          id: 'money-nudged',
          done: t({ id: 'money.settle.nudged', message: `Nudged ${who}. Gently.` }),
          refused: {
            NUDGE_TOO_SOON: t({
              id: 'money.settle.nudgeLater',
              message: 'Already nudged today. Try tomorrow.',
            }),
          },
        };
      case 'confirm':
        return {
          id: 'money-payment',
          done: t({ id: 'money.pay.confirmed', message: 'Confirmed. Balances re-count.' }),
        };
      case 'dispute':
        return {
          id: 'money-payment',
          done: t({ id: 'money.pay.disputed', message: `Told ${who} it didn't arrive.` }),
        };
      case 'remind':
        return {
          id: 'money-remind',
          done: t({ id: 'money.settle.reminded', message: 'Reminded everyone who owes.' }),
          refused: {
            RATE_LIMITED: t({
              id: 'money.settle.remindLater',
              message: 'Everyone got a reminder today already.',
            }),
          },
        };
    }
  };
}
