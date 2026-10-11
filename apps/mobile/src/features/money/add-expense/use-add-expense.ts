/**
 * Adding (or editing) an expense for either UI: the draft and its labels, then what the keypad's
 * buttons do. Add queues `add_expense` (it works in airplane mode), lands on Balances and toasts
 * "Added Rp 450.000, US$4.74 each."; a refused add shakes the amount and says it did not go
 * through. Add sends once: a tap while it is going out, or after, does nothing. Scan instead swaps
 * to the receipt scan in place. Opened for one trip, the expense goes to that trip.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useState } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';
import { goBackOr } from '@/lib/navigation/back';
import { feedback } from '@/motion';
import { toast, useCommandFeedback } from '@/motion/island-toast';

import { MONEY_FALLBACK } from '../components/screen-states';
import { selectTrip } from '../data/selected-trip';
import { formatAmount } from '../format';
import { MONEY_ROUTES } from '../routes';
import { amountMinorOf, draftProblem } from './draft';
import { useAddLabels } from './labels';
import { spentAtForDay } from './spent-day';
import { useExpenseDraft } from './useExpenseDraft';

export type AddExpense = ReturnType<typeof useAddExpense>;

export function useAddExpense(
  editId: string | null,
  prefillName: string | null,
  tripId: string | null,
) {
  const state = useExpenseDraft(editId, prefillName, tripId);
  const locale = useLocale();
  const { t } = useLingui();
  const { report } = useCommandFeedback();
  const [shake, setShake] = useState(0);
  const { draft, preview, crewCurrency } = state;
  const labels = useAddLabels(draft, preview, crewCurrency, state.editing);
  const amountMinor = amountMinorOf(draft);

  /**
   * Where the keypad leaves to. A new expense lands on Balances whatever opened the keypad, so no
   * keypad is left on screen to add it again, and Balances shows the trip it went to; an edit goes
   * back to the expense it came from.
   */
  function leave(): void {
    if (state.editing) {
      goBackOr(MONEY_FALLBACK);
      return;
    }
    if (tripId !== null) selectTrip(tripId);
    router.dismissTo(MONEY_ROUTES.balances);
  }

  async function submit() {
    if (draftProblem(draft) !== null) {
      feedback.emit('error');
      setShake((count) => count + 1);
      return;
    }
    const result = await state.submit();
    // The tap that sent it finishes the screen.
    if (result === 'already') return;
    if (result === null) {
      if (state.editing) leave();
      return;
    }
    // Queued counts: the expense is on the phone and sends by itself. A refusal says so.
    const outcome = report(result, { id: 'money-added', offlineCapable: true });
    if (outcome === 'refused' || outcome === 'needs-signal') {
      setShake((count) => count + 1);
      return;
    }
    feedback.emit('success');
    const full = formatAmount(amountMinor, draft.currency, locale);
    const each = labels.each;
    toast.show({
      id: 'money-added',
      title: state.editing
        ? t({ id: 'money.add.savedToast', message: 'Saved. Balances re-count.' })
        : each === null
          ? t({ id: 'money.add.addedToast', message: `Added ${full}.` })
          : t({ id: 'money.add.addedEachToast', message: `Added ${full}, ${each} each.` }),
    });
    leave();
  }

  return {
    ...state,
    labels,
    amountMinor,
    shake,
    submit: () => void submit(),
    scanInstead: () =>
      router.replace(
        tripId === null
          ? MONEY_ROUTES.scan
          : { pathname: MONEY_ROUTES.scan, params: { trip: tripId } },
      ),
    setDay: (back: number) => {
      const next = spentAtForDay({
        daysBack: back,
        current: draft.spentAt,
        editing: state.editing,
        now: new Date(),
      });
      if (next !== null) state.dispatch({ type: 'spentAt', at: next.at });
    },
  };
}
