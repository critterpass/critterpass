import type { PaymentMethod, PayoutKind } from '@cp/domain';

/** The method a payout kind is paid with: a Wise link is paid as "wise", the rest by their kind. */
export function methodOf(kind: PayoutKind): PaymentMethod {
  return kind === 'wise_link' ? 'wise' : kind;
}

/** The payout kind a method's label comes from (a "wise" payment is labelled as the Wise link). */
export function labelKindOf(method: Exclude<PaymentMethod, 'other'>): PayoutKind {
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a payout kind, not copy
  return method === 'wise' ? 'wise_link' : method;
}
