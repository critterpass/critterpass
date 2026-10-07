/** The one-line summary of a plan ("Yearly · renews 2 Nov 2027"), shared by every plan surface. */
import { format } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';

import { useLocale } from '@/lib/i18n/use-locale';

import type { BoostLine, PlanModel } from './plan-model';

const LONG_DATE: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };

export function usePlanDate(): (iso: string | null) => string | null {
  const locale = useLocale();
  return (iso) => {
    if (iso === null) return null;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : format.date(locale, date, LONG_DATE);
  };
}

export function usePlanLine(): (plan: PlanModel) => string {
  const { t } = useLingui();
  const planDate = usePlanDate();
  return (plan) => {
    const date = planDate(plan.date);
    switch (plan.kind) {
      case 'free':
        return t({ id: 'monetize.plan.line.free', message: 'The free plan' });
      case 'active':
        if (date === null) {
          return plan.period === 'yearly'
            ? t({ id: 'monetize.plan.line.yearly', message: 'Yearly' })
            : t({ id: 'monetize.plan.line.monthly', message: 'Monthly' });
        }
        return plan.period === 'yearly'
          ? t({ id: 'monetize.plan.line.yearlyRenews', message: `Yearly · renews ${date}` })
          : t({ id: 'monetize.plan.line.monthlyRenews', message: `Monthly · renews ${date}` });
      case 'cancelled':
        return date === null
          ? t({ id: 'monetize.plan.line.cancelled', message: 'Won’t renew' })
          : t({ id: 'monetize.plan.line.ends', message: `Ends ${date}` });
      case 'grace':
        return date === null
          ? t({ id: 'monetize.plan.line.grace', message: 'The last payment didn’t go through' })
          : t({
              id: 'monetize.plan.line.graceUntil',
              message: `The last payment didn’t go through · on until ${date}`,
            });
      case 'payment_failed':
        return t({
          id: 'monetize.plan.line.paymentFailed',
          message: 'Off until the payment goes through',
        });
      case 'paused':
        return date === null
          ? t({ id: 'monetize.plan.line.paused', message: 'Paused' })
          : t({ id: 'monetize.plan.line.pausedUntil', message: `Paused until ${date}` });
      case 'expired':
        return t({ id: 'monetize.plan.line.expired', message: 'Pass+ has ended' });
      case 'granted':
        return date === null
          ? t({ id: 'monetize.plan.line.granted', message: 'Pass+ is on' })
          : t({ id: 'monetize.plan.line.grantedUntil', message: `Pass+ until ${date}` });
    }
  };
}

/** A boost row's second line: what it is, its window and, for a split, how much of it is settled. */
export function useBoostLine(): (boost: BoostLine) => string {
  const { t } = useLingui();
  const planDate = usePlanDate();
  return (boost) => {
    const until = planDate(boost.endsAt);
    const kind =
      boost.source === 'first_trip_free'
        ? t({ id: 'monetize.plan.boost.ftf', message: 'First trip free' })
        : boost.source === 'crew_year'
          ? t({ id: 'monetize.plan.boost.year', message: 'Crew yearly boost' })
          : t({ id: 'monetize.plan.boost.trip', message: 'Trip Boost' });
    const window =
      until === null
        ? kind
        : boost.on
          ? t({ id: 'monetize.plan.boost.onUntil', message: `${kind} · on until ${until}` })
          : t({ id: 'monetize.plan.boost.ended', message: `${kind} · ended ${until}` });
    if (boost.settled === null) return window;
    const { done, of } = boost.settled;
    return t({
      id: 'monetize.plan.boost.settled',
      message: `${window} · ${done} of ${of} settled`,
    });
  };
}
