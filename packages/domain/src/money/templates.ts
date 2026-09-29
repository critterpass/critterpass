/**
 * Money copy the server renders into pushes (catalog id + source message; the worker renders it in
 * each recipient's language). Amounts are already formatted in the crew currency; no push ever
 * carries payout details.
 */
export interface MoneyCopy {
  readonly id: string;
  readonly message: string;
}

const copy = (id: string, message: string): MoneyCopy => ({ id, message });

export const MONEY_PUSH_TITLE = copy('notifications.money.title', '{crew}');

export const MONEY_PUSH_BODY = {
  expense_added: copy(
    'notifications.money.expense_added',
    '{payer} paid {amount} for {what}. Your share is {share}.',
  ),
  requested: copy('notifications.money.requested', '{payee} asked you for {amount}.'),
  nudged: copy('notifications.money.nudged', '{payee} nudged you about {amount}. Gently.'),
  reminded: copy('notifications.money.reminded', 'Settle-up time: you owe {payee} {amount}.'),
  marked_paid: copy(
    'notifications.money.marked_paid',
    '{payer} says they paid you {amount}. Got it?',
  ),
  confirmed: copy('notifications.money.confirmed', '{payee} got your {amount}. All clear.'),
  disputed: copy(
    'notifications.money.disputed',
    "{payee} hasn't seen your {amount} yet. Check the transfer?",
  ),
} as const;

export const SETTLED_PUSH = {
  title: copy('notifications.money.settled.title', 'All square'),
  body: copy('notifications.money.settled.body', 'Everyone gets the Settled Tokek.'),
} as const;
