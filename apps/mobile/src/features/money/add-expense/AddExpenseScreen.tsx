/**
 * Add (or edit) an expense (the draft and what its buttons do are `useAddExpense`): the keypad
 * page, the currency picker and the details sheet.
 */
import { useState } from 'react';

import { ExpenseGone, MoneyNoTripScreen, MoneyScreenLoading } from '../components/screen-states';
import { AddExpenseView } from './AddExpenseView';
import { CurrencyPicker } from './CurrencyPicker';
import { DetailsSheet } from './DetailsSheet';
import { sharesByMember } from './draft';
import { daysBackOf } from './spent-day';
import { useAddExpense } from './use-add-expense';

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
  const state = useAddExpense(editId, prefillName, tripId);
  const [sheet, setSheet] = useState<'currency' | 'details' | null>(null);
  const { draft, ctx } = state;
  const { approx, ctaLabel } = state.labels;

  if (state.loading) return <MoneyScreenLoading />;
  if (ctx.crew === null || ctx.trip === null) return <MoneyNoTripScreen crew={ctx.crew !== null} />;
  // The rows are read and there is still no draft: the expense to edit is not in this trip.
  if (!state.ready) return <ExpenseGone />;
  const members = ctx.members.filter((member) => draft.memberIds.includes(member.userId));

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
        ctaDisabled={state.amountMinor === 0n || state.sent}
        shake={state.shake}
        submitting={state.pending}
        onKey={(key) => state.dispatch({ type: 'key', key })}
        onPayer={(userId) => state.dispatch({ type: 'payer', userId })}
        onMode={(mode) => state.dispatch({ type: 'mode', mode })}
        onToggle={(userId) => state.dispatch({ type: 'toggle', userId })}
        onStep={(userId, delta) => state.dispatch({ type: 'weight', userId, delta })}
        onFocus={(userId) => state.dispatch({ type: 'focus', userId })}
        onCurrency={() => setSheet('currency')}
        onDetails={() => setSheet('details')}
        onScanInstead={state.scanInstead}
        onSubmit={state.submit}
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
          onDay={state.setDay}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </>
  );
}
