/**
 * Add (or edit) an expense. ADD queues `add_expense` (it works in airplane mode), goes back to
 * Balances and toasts "Added Rp 450.000, US$4.74 each."; a refused ADD shakes the amount and
 * buzzes. SCAN INSTEAD swaps to the receipt scan in place.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useState } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';
import { feedback } from '@/motion';
import { toast } from '@/motion/island-toast';

import { MoneyLoading } from '../balances/BalancesScreen';
import { formatAmount, formatShort } from '../format';
import { MONEY_ROUTES } from '../routes';
import { AddExpenseView } from './AddExpenseView';
import { CurrencyPicker } from './CurrencyPicker';
import { DetailsSheet, shiftDays } from './DetailsSheet';
import { amountMinorOf, draftProblem } from './draft';
import { useExpenseDraft } from './useExpenseDraft';

export function AddExpenseScreen({ editId }: { readonly editId: string | null }) {
  const state = useExpenseDraft(editId);
  const locale = useLocale();
  const { t } = useLingui();
  const [sheet, setSheet] = useState<'currency' | 'details' | null>(null);
  const [shake, setShake] = useState(0);
  const [daysBack, setDaysBack] = useState(0);
  const { draft, preview, crewCurrency, ctx } = state;

  if (!state.ready || ctx.crew === null) return <MoneyLoading />;

  const amountMinor = amountMinorOf(draft);
  const total = preview === null ? '' : formatAmount(preview.crewTotalMinor, crewCurrency, locale);
  const each =
    preview?.eachMinor == null ? null : formatAmount(preview.eachMinor, crewCurrency, locale);
  const foreign = draft.currency !== crewCurrency;
  let approx: string | undefined;
  if (preview !== null && foreign && !preview.converted) {
    approx = t({ id: 'money.add.noRate', message: 'Converts once this phone has a rate' });
  } else if (preview !== null && foreign) {
    approx =
      each === null
        ? t({ id: 'money.add.approx', message: `≈ ${total}` })
        : t({ id: 'money.add.approxEach', message: `≈ ${total} · ${each} each` });
  } else if (each !== null) {
    approx = t({ id: 'money.add.each', message: `${each} each` });
  }
  const short = formatShort(amountMinor, draft.currency, locale);
  const ctaLabel = upper(
    state.editing
      ? t({ id: 'money.add.save', message: 'Save' })
      : amountMinor === 0n
        ? t({ id: 'money.add.addEmpty', message: 'Add' })
        : t({ id: 'money.add.add', message: `Add ${short}` }),
    locale,
  );
  const members = ctx.members.filter((member) => draft.memberIds.includes(member.userId));

  async function onSubmit() {
    if (draftProblem(draft) !== null) {
      feedback.emit('error');
      setShake((count) => count + 1);
      return;
    }
    const result = await state.submit();
    if (result === null) {
      if (state.editing) router.back();
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
    router.back();
  }

  return (
    <>
      <AddExpenseView
        crewName={ctx.crew.name}
        editing={state.editing}
        draft={draft}
        members={members}
        approx={approx}
        perMember={preview?.perMember ?? null}
        ctaLabel={ctaLabel}
        ctaDisabled={amountMinor === 0n}
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
