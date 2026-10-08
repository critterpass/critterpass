/**
 * Add (or edit) an expense. ADD queues `add_expense` (it works in airplane mode), lands on
 * Balances and toasts "Added Rp 450.000, US$4.74 each."; a refused ADD shakes the amount and says
 * it did not go through. ADD sends once: a tap while it is going out, or after, does nothing. SCAN
 * INSTEAD swaps to the receipt scan in place. Opened for one trip (the guide's camera, a chat
 * card), the expense goes to that trip and Balances shows it afterwards.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useState } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';
import { goBackOr } from '@/lib/navigation/back';
import { feedback } from '@/motion';
import { toast, useCommandFeedback } from '@/motion/island-toast';

import {
  ExpenseGone,
  MONEY_FALLBACK,
  MoneyNoTripScreen,
  MoneyScreenLoading,
} from '../components/screen-states';
import { selectTrip } from '../data/selected-trip';
import { formatAmount } from '../format';
import { MONEY_ROUTES } from '../routes';
import { AddExpenseView } from './AddExpenseView';
import { CurrencyPicker } from './CurrencyPicker';
import { DetailsSheet } from './DetailsSheet';
import { amountMinorOf, draftProblem, sharesByMember } from './draft';
import { useAddLabels } from './labels';
import { daysBackOf, spentAtForDay } from './spent-day';
import { useExpenseDraft } from './useExpenseDraft';

export function AddExpenseScreen({
  editId,
  prefillName = null,
  tripId = null,
}: {
  readonly editId: string | null;
  readonly prefillName?: string | null;
  /** The trip the keypad was opened for; without it the expense goes to the trip on Balances. */
  readonly tripId?: string | null;
}) {
  const state = useExpenseDraft(editId, prefillName, tripId);
  const locale = useLocale();
  const { t } = useLingui();
  const { report } = useCommandFeedback();
  const [sheet, setSheet] = useState<'currency' | 'details' | null>(null);
  const [shake, setShake] = useState(0);
  const { draft, preview, crewCurrency, ctx } = state;
  const labels = useAddLabels(draft, preview, crewCurrency, state.editing);

  if (state.loading) return <MoneyScreenLoading />;
  if (ctx.crew === null || ctx.trip === null) return <MoneyNoTripScreen crew={ctx.crew !== null} />;
  // The rows are read and there is still no draft: the expense to edit is not in this trip.
  if (!state.ready) return <ExpenseGone />;

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

  const amountMinor = amountMinorOf(draft);
  const { approx, ctaLabel, each } = labels;
  const members = ctx.members.filter((member) => draft.memberIds.includes(member.userId));

  async function onSubmit() {
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

  return (
    <>
      <AddExpenseView
        crewName={ctx.crew.name}
        editing={state.editing}
        draft={draft}
        members={members}
        approx={approx}
        perMember={sharesByMember(draft)}
        ctaLabel={ctaLabel}
        ctaDisabled={amountMinor === 0n || state.sent}
        shake={shake}
        submitting={state.pending}
        onKey={(key) => state.dispatch({ type: 'key', key })}
        onPayer={(userId) => state.dispatch({ type: 'payer', userId })}
        onMode={(mode) => state.dispatch({ type: 'mode', mode })}
        onToggle={(userId) => state.dispatch({ type: 'toggle', userId })}
        onStep={(userId, delta) => state.dispatch({ type: 'weight', userId, delta })}
        onFocus={(userId) => state.dispatch({ type: 'focus', userId })}
        onCurrency={() => setSheet('currency')}
        onDetails={() => setSheet('details')}
        onScanInstead={() =>
          router.replace(
            tripId === null
              ? MONEY_ROUTES.scan
              : { pathname: MONEY_ROUTES.scan, params: { trip: tripId } },
          )
        }
        onSubmit={() => void onSubmit()}
      />
      {sheet === 'currency' ? (
        <CurrencyPicker
          currencies={state.currencies}
          current={draft.currency}
          onPick={(currency) => {
            state.dispatch({ type: 'currency', currency });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet === 'details' ? (
        <DetailsSheet
          description={draft.description}
          category={draft.category}
          daysBack={daysBackOf(draft.spentAt, new Date())}
          onDescription={(text) => state.dispatch({ type: 'description', text })}
          onCategory={(category) => state.dispatch({ type: 'category', category })}
          onDay={(back) => {
            const next = spentAtForDay({
              daysBack: back,
              current: draft.spentAt,
              editing: state.editing,
              now: new Date(),
            });
            if (next !== null) state.dispatch({ type: 'spentAt', at: next.at });
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </>
  );
}
