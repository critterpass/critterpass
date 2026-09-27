/**
 * One FX context per calculation: every conversion in a share calc uses the snapshots of a single
 * ingest run, recorded by `snapshotId`, so a stored calc is reproducible forever and the UI can say
 * which rates it used ("rates from {date}").
 */
import { DomainError } from '@cp/domain';

import { convert, convertViaBase } from '../fx/convert';
import { type FxSnapshot } from '../fx/snapshot';
import { type CurrencyCode } from '../money/currencies';
import { type Money } from '../money/money';

export interface FxContext {
  /** The `fx_snapshots` run every rate below belongs to; stored on the calc. */
  readonly snapshotId: string;
  readonly snapshots: readonly FxSnapshot[];
}

/** Converts `amount` to `target` via a direct snapshot or two snapshots sharing a base. */
export function convertWith(amount: Money, target: CurrencyCode, fx: FxContext | undefined): Money {
  if (amount.currency === target) return amount;
  if (!fx) {
    throw new DomainError('VALIDATION', {
      reason: 'fx_required',
      from: amount.currency,
      to: target,
    });
  }
  const direct = fx.snapshots.find(
    (s) =>
      (s.base === amount.currency && s.quote === target) ||
      (s.base === target && s.quote === amount.currency),
  );
  if (direct) return convert(amount, target, direct);
  for (const fromBase of fx.snapshots.filter((s) => s.quote === amount.currency)) {
    const toBase = fx.snapshots.find((s) => s.base === fromBase.base && s.quote === target);
    if (toBase) return convertViaBase(amount, target, fromBase, toBase);
  }
  throw new DomainError('VALIDATION', {
    reason: 'fx_rate_missing',
    from: amount.currency,
    to: target,
  });
}
