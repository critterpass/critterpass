/** "≈ $1,120 in USD": what a typed max is in the trip currency, at the latest synced rate. */
import { assertCurrencyCode, convertWith, type FxContext } from '@cp/cost-engine';
import { t } from '@lingui/core/macro';

import { money } from './model';

export function approxIn(
  locale: string,
  amountMinor: number,
  from: string,
  to: string,
  fx: FxContext | undefined,
): string | undefined {
  try {
    const converted = convertWith(
      { amountMinor: BigInt(amountMinor), currency: assertCurrencyCode(from) },
      assertCurrencyCode(to),
      fx,
    );
    const amount = money(locale, Number(converted.amountMinor), to);
    return t({ id: 'setup.budget.member.approx', message: `≈ ${amount} in ${to}` });
  } catch {
    return undefined;
  }
}
