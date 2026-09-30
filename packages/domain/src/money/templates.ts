/**
 * Money copy the server renders into pushes (catalog id + source message; the worker renders it in
 * each recipient's language). Amounts are already formatted in the crew currency; no push ever
 * carries payout details.
 */
export interface MoneyCopy {
  readonly id: string;
  readonly message: string;
}

export const MONEY_PUSH_TITLE = /*i18n*/ { id: 'notifications.money.title', message: '{crew}' };

export const MONEY_PUSH_BODY = {
  expense_added: /*i18n*/ {
    id: 'notifications.money.expense_added',
    message: '{payer} paid {amount} for {what}. Your share is {share}.',
  },
  requested: /*i18n*/ {
    id: 'notifications.money.requested',
    message: '{payee} asked you for {amount}.',
  },
  nudged: /*i18n*/ {
    id: 'notifications.money.nudged',
    message: '{payee} nudged you about {amount}. Gently.',
  },
  reminded: /*i18n*/ {
    id: 'notifications.money.reminded',
    message: 'Settle-up time: you owe {payee} {amount}.',
  },
  marked_paid: /*i18n*/ {
    id: 'notifications.money.marked_paid',
    message: '{payer} says they paid you {amount}. Got it?',
  },
  confirmed: /*i18n*/ {
    id: 'notifications.money.confirmed',
    message: '{payee} got your {amount}. All clear.',
  },
  disputed: /*i18n*/ {
    id: 'notifications.money.disputed',
    message: "{payee} hasn't seen your {amount} yet. Check the transfer?",
  },
} as const;

export const SETTLED_PUSH = {
  title: /*i18n*/ { id: 'notifications.money.settled.title', message: 'All square' },
  body: /*i18n*/ {
    id: 'notifications.money.settled.body',
    message: 'Everyone gets the Settled Tokek.',
  },
} as const;
