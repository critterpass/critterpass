/**
 * Add (or edit) an expense. ADD queues `add_expense` (it works in airplane mode), lands on
 * Balances and toasts "Added Rp 450.000, US$4.74 each."; a refused ADD shakes the amount and
 * buzzes. ADD sends once: a tap while it is going out, or after, does nothing. SCAN INSTEAD swaps
 * to the receipt scan in place.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useState } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';
import { feedback } from '@/motion';
import { toast } from '@/motion/island-toast';

import { MoneyLoading } from '../balances/BalancesScreen';
import { formatAmount } from '../format';
import { MONEY_ROUTES } from '../routes';
import { AddExpenseView } from './AddExpenseView';
import { CurrencyPicker } from './CurrencyPicker';
import { DetailsSheet, shiftDays } from './DetailsSheet';
import { amountMinorOf, draftProblem, sharesByMember } from './draft';
import { useAddLabels } from './labels';
import { useExpenseDraft } from './useExpenseDraft';

/**
 * Where the keypad leaves to. A new expense lands on Balances whatever opened the keypad, so no
 * keypad is left on screen to add it again; an edit goes back to the expense it came from.
 */
function leave(editing: boolean): void {
  if (editing && router.canGoBack()) router.back();
  else router.dismissTo(MONEY_ROUTES.balances);
}

export function AddExpenseScreen({
  editId,
  prefillName = null,
}: {
  readonly editId: string | null;
  readonly prefillName?: string | null;
}) {
  const state = useExpenseDraft(editId, prefillName);
  const locale = useLocale();
  const { t } = useLingui();
  const [sheet, setSheet] = useState<'currency' | 'details' | null>(null);
  const [shake, setShake] = useState(0);
  const [daysBack, setDaysBack] = useState(0);
  const { draft, preview, crewCurrency, ctx } = state;
  const labels = useAddLabels(draft, preview, crewCurrency, state.editing);

  if (!state.ready || ctx.crew === null) return <MoneyLoading />;

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
      if (state.editing) leave(true);
      return;
    }
    if (result.kind === 'rejected' || result.kind === 'unavailable') {
      feedback.emit('error');
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
    leave(state.editing);
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
        onScanInstead={() => router.replace(MONEY_ROUTES.scan)}
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
          daysBack={daysBack}
          onDescription={(text) => state.dispatch({ type: 'description', text })}
          onCategory={(category) => state.dispatch({ type: 'category', category })}
          onDay={(back) => {
            setDaysBack(back);
            state.dispatch({
              type: 'spentAt',
              at: back === 0 ? null : shiftDays(new Date(), back),
            });
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </>
  );
}
