/**
 * One destination's cost indices: per stay type the nightly stay band and the food and fun amounts
 * per person per day, in the row's currency, with its cited source; rows without a source page are
 * badged "estimate". Each row is approved as it is, or edited and then saved and approved, through
 * the audited `review_cost_index` command.
 */
import type { CostIndexAmounts, CostReviewIndex } from '@cp/domain';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { ErrorState } from '../../kit/states';
import { runCommand } from '../../lib/api';
import { useOperator } from '../../lib/session';
import { formatMinor, inputToMinor, minorToInput } from './money';

const FIELDS = [
  { key: 'nightly_minor_low', label: 'stay low' },
  { key: 'nightly_minor_high', label: 'stay high' },
  { key: 'food_pp_day_minor', label: 'food' },
  { key: 'fun_pp_day_minor', label: 'fun' },
] as const satisfies ReadonlyArray<{ key: keyof CostIndexAmounts; label: string }>;

type Draft = Record<keyof CostIndexAmounts, string>;

function draftOf(index: CostReviewIndex): Draft {
  return {
    nightly_minor_low: minorToInput(index.nightly_minor_low, index.currency),
    nightly_minor_high: minorToInput(index.nightly_minor_high, index.currency),
    food_pp_day_minor: minorToInput(index.food_pp_day_minor, index.currency),
    fun_pp_day_minor: minorToInput(index.fun_pp_day_minor, index.currency),
  };
}

/** The edited amounts, or a message saying why they cannot be saved. */
function parseDraft(draft: Draft, currency: string): CostIndexAmounts | string {
  const amounts: Partial<CostIndexAmounts> = {};
  for (const { key } of FIELDS) {
    const value = inputToMinor(draft[key], currency);
    if (value === undefined) return `Amounts are ${currency} values such as 45 or 45.50.`;
    amounts[key] = value;
  }
  const parsed = amounts as CostIndexAmounts;
  if (parsed.nightly_minor_high < parsed.nightly_minor_low) {
    return 'The stay high must not be below the stay low.';
  }
  return parsed;
}

function IndexRow({ index }: { index: CostReviewIndex }) {
  const me = useOperator();
  const client = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const edited = draft === null ? null : parseDraft(draft, index.currency);
  const invalid = typeof edited === 'string' ? edited : null;
  const money = (minor: number) => formatMinor(minor, index.currency);

  const approve = async () => {
    if (invalid !== null) return;
    setError(null);
    setBusy(true);
    try {
      await runCommand(
        'review_cost_index',
        { index_id: index.id, ...(edited === null ? {} : { amounts: edited }) },
        me.uid,
      );
      setDraft(null);
      await client.invalidateQueries({ queryKey: ['costs'] });
      await client.invalidateQueries({ queryKey: ['home'] });
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  const input = (key: keyof CostIndexAmounts, label: string) => (
    <input
      className="input mono"
      inputMode="decimal"
      style={{ width: 84 }}
      aria-label={`${index.stay_type} ${label}`}
      value={draft?.[key] ?? ''}
      onChange={(event) =>
        setDraft((current) => ({ ...(current ?? draftOf(index)), [key]: event.target.value }))
      }
    />
  );

  const band = (label: string, shown: string, editor: ReactNode) => (
    <div className="stack" style={{ gap: 'var(--space-4)', minWidth: 96 }}>
      <span className="muted">{label}</span>
      <span className="mono" style={{ whiteSpace: 'nowrap' }}>
        {draft === null ? shown : editor}
      </span>
    </div>
  );

  return (
    <li
      className="stack"
      aria-label={index.stay_type}
      data-estimated={index.estimated}
      style={{
        paddingTop: 'var(--space-12)',
        borderTop: '1px solid var(--semantic-border-decorative)',
      }}
    >
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row">
          <strong>{index.stay_type}</strong>
          {index.estimated && (
            <span className="badge" data-tone="warning">
              estimate
            </span>
          )}
          {index.reviewed_at === null ? (
            <span className="badge">draft</span>
          ) : (
            <span className="badge" data-tone="success">
              approved {new Date(index.reviewed_at).toLocaleDateString()}
            </span>
          )}
        </div>
        <div className="row">
          {draft === null ? (
            <>
              <button type="button" className="btn" onClick={() => setDraft(draftOf(index))}>
                Edit
              </button>
              {index.reviewed_at === null && (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => void approve()}
                >
                  Approve
                </button>
              )}
            </>
          ) : (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setDraft(null)}>
                Discard edits
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || invalid !== null}
                onClick={() => void approve()}
              >
                Save and approve
              </button>
            </>
          )}
        </div>
      </div>
      <div className="row" style={{ gap: 'var(--space-16)', alignItems: 'flex-start' }}>
        {band(
          'Stay / night',
          `${money(index.nightly_minor_low)} – ${money(index.nightly_minor_high)}`,
          <span className="row" style={{ flexWrap: 'nowrap', gap: 'var(--space-4)' }}>
            {input('nightly_minor_low', 'stay low')}–{input('nightly_minor_high', 'stay high')}
          </span>,
        )}
        {band('Food / day', money(index.food_pp_day_minor), input('food_pp_day_minor', 'food'))}
        {band('Fun / day', money(index.fun_pp_day_minor), input('fun_pp_day_minor', 'fun'))}
      </div>
      {invalid !== null && <div className="field-error">{invalid}</div>}
      <div className="muted" style={{ wordBreak: 'break-word' }}>
        {index.source_url === null ? (
          index.source
        ) : (
          <a href={index.source_url} target="_blank" rel="noreferrer noopener">
            {index.source}
          </a>
        )}{' '}
        · checked {index.sourced_on}
      </div>
      {error !== null && <ErrorState error={error} title="That didn’t go through" />}
    </li>
  );
}

export function DestinationCard({
  name,
  indices,
}: {
  name: string;
  indices: readonly CostReviewIndex[];
}) {
  const pending = indices.filter((index) => index.reviewed_at === null).length;
  const currency = indices[0]?.currency ?? '';
  return (
    <article className="card stack" aria-label={`${name} cost indices`}>
      <div className="row">
        <strong>{name}</strong>
        <span className="muted">{currency} per person</span>
        {pending > 0 && (
          <span className="badge" data-tone="warning">
            {pending} draft {pending === 1 ? 'row' : 'rows'}
          </span>
        )}
      </div>
      <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {indices.map((index) => (
          <IndexRow key={index.id} index={index} />
        ))}
      </ul>
    </article>
  );
}
