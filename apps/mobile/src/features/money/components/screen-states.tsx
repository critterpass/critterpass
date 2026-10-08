/**
 * What Money's pushed screens show before their content: the loading skeleton under the MONEY back
 * eyebrow while the rows are read, and a "not here" state once they are read and there is no trip
 * to split, or the expense or payment the screen is about is gone. Back always lands on Balances
 * when nothing is under the screen (a link, a chat card on a cold start).
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import type { Href } from 'expo-router';

import { useLocale } from '@/lib/i18n/use-locale';
import { ScreenLoading } from '@/ui/states/ScreenLoading';
import { ScreenMissing } from '@/ui/states/ScreenMissing';

import { MONEY_ROUTES } from '../routes';

/** Where back lands from a money screen opened with nothing under it. */
export const MONEY_FALLBACK: Href = MONEY_ROUTES.balances;

/** The MONEY back eyebrow's label. */
export function useMoneyBackLabel(): string {
  const { t } = useLingui();
  const locale = useLocale();
  return upper(t({ id: 'money.back', message: 'Money' }), locale);
}

export function MoneyScreenLoading({ testID = 'money-loading' }: { readonly testID?: string }) {
  const { t } = useLingui();
  return (
    <ScreenLoading
      backLabel={useMoneyBackLabel()}
      fallback={MONEY_FALLBACK}
      label={t({ id: 'money.loading', message: 'Loading the money' })}
      testID={testID}
    />
  );
}

/** A money screen opened with no trip to split (or no crew at all). */
export function MoneyNoTripScreen({ crew }: { readonly crew: boolean }) {
  const { t } = useLingui();
  return (
    <ScreenMissing
      backLabel={useMoneyBackLabel()}
      fallback={MONEY_FALLBACK}
      title={
        crew
          ? t({ id: 'money.noTrip.title', message: 'No trip to split yet' })
          : t({ id: 'money.noCrew.title', message: 'Money is for crews' })
      }
      line={
        crew
          ? t({
              id: 'money.noTrip.line',
              message: 'Once the crew has a trip, every expense lands here and I keep the tally.',
            })
          : t({
              id: 'money.noCrew.line',
              message: 'Start or join a crew and I will split every bill with them.',
            })
      }
      testID={crew ? 'money-no-trip' : 'money-no-crew'}
    />
  );
}

/** The expense was deleted (here or on another phone), or this phone never had it. */
export function ExpenseGone() {
  const { t } = useLingui();
  return (
    <ScreenMissing
      backLabel={useMoneyBackLabel()}
      fallback={MONEY_FALLBACK}
      title={t({ id: 'money.detail.goneTitle', message: 'This expense is gone' })}
      line={t({
        id: 'money.detail.goneLine',
        message: 'Someone deleted it. The balances already left it out.',
      })}
      testID="money-expense-gone"
    />
  );
}

/** The payment is no longer on the settle list: it was settled or re-counted meanwhile. */
export function PaymentGone() {
  const { t } = useLingui();
  const locale = useLocale();
  return (
    <ScreenMissing
      backLabel={upper(t({ id: 'money.pay.back', message: 'Settle up' }), locale)}
      fallback={MONEY_ROUTES.settle}
      title={t({ id: 'money.pay.goneTitle', message: 'This payment has moved on' })}
      line={t({
        id: 'money.pay.goneLine',
        message: 'It was settled, or the balances were re-counted. Settle up has what is open now.',
      })}
      testID="money-payment-gone"
    />
  );
}
