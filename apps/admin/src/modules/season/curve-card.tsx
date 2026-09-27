/**
 * One destination's month curve: crowd and price level per month with a bar, the colour role and
 * highlight, and each month's cited source; interpolated or estimated months carry a badge. The
 * reviewer approves the curve as it is, or edits crowd and price values first and then approves.
 */
import type { SeasonReviewCurve, SeasonReviewMonth } from '@cp/domain';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ErrorState } from '../../kit/states';
import { runCommand } from '../../lib/api';
import { useOperator } from '../../lib/session';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type Draft = Readonly<Record<number, { crowd: string; price: string }>>;

function Level({ value }: { value: number | null }) {
  if (value === null) return <span className="muted">—</span>;
  return (
    <span className="row" style={{ gap: 'var(--space-8)', flexWrap: 'nowrap' }}>
      <span
        aria-hidden="true"
        style={{
          display: 'inline-block',
          width: 64,
          height: 6,
          borderRadius: 3,
          background: 'var(--semantic-bg-control)',
        }}
      >
        <span
          style={{
            display: 'block',
            width: `${value}%`,
            height: '100%',
            borderRadius: 3,
            background: 'var(--semantic-action-primary)',
          }}
        />
      </span>
      <span className="mono">{value}</span>
    </span>
  );
}

/** A 0–100 level from an input; `null` for a blank price, `undefined` when not a valid level. */
function parseLevel(text: string, nullable: boolean): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return nullable ? null : undefined;
  const value = Number(trimmed);
  return Number.isInteger(value) && value >= 0 && value <= 100 ? value : undefined;
}

function draftOf(months: readonly SeasonReviewMonth[]): Draft {
  return Object.fromEntries(
    months.map((month) => [
      month.month,
      { crowd: String(month.crowd_index), price: month.price_index?.toString() ?? '' },
    ]),
  );
}

export function CurveCard({ curve }: { curve: SeasonReviewCurve }) {
  const me = useOperator();
  const client = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const pending = curve.months.filter((month) => month.reviewed_at === null).length;
  const approvedAt = curve.months
    .map((month) => month.reviewed_at ?? '')
    .sort()
    .at(-1);

  const edited = curve.months.map((month) => {
    const entry = draft?.[month.month];
    return {
      month,
      crowd: entry === undefined ? month.crowd_index : parseLevel(entry.crowd, false),
      price: entry === undefined ? month.price_index : parseLevel(entry.price, true),
    };
  });
  const invalid = edited.some((row) => row.crowd === undefined || row.price === undefined);

  const approve = async () => {
    setError(null);
    setBusy(true);
    try {
      await runCommand(
        'upsert_season_editorial',
        {
          destination_id: curve.destination_id,
          months: edited.map(({ month, crowd, price }) => ({
            month: month.month,
            crowd_index: crowd,
            price_index: price,
            highlight_tag: month.highlight_tag,
            colour_role: month.colour_role,
            source: month.source,
            source_url: month.source_url,
            sourced_on: month.sourced_on,
          })),
          events: [],
          approve: true,
        },
        me.uid,
      );
      setDraft(null);
      await client.invalidateQueries({ queryKey: ['season'] });
      await client.invalidateQueries({ queryKey: ['home'] });
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  const setField = (month: number, field: 'crowd' | 'price', value: string) => {
    setDraft((current) => {
      const base = current ?? draftOf(curve.months);
      const entry = base[month] ?? { crowd: '', price: '' };
      return { ...base, [month]: { ...entry, [field]: value } };
    });
  };

  return (
    <article className="card stack" aria-label={`${curve.destination_name} curve`}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row">
          <strong>{curve.destination_name}</strong>
          {pending > 0 ? (
            <span className="badge" data-tone="warning">
              {pending} draft {pending === 1 ? 'month' : 'months'}
            </span>
          ) : (
            <span className="badge" data-tone="success">
              approved{approvedAt ? ` ${new Date(approvedAt).toLocaleDateString()}` : ''}
            </span>
          )}
        </div>
        <div className="row">
          {draft === null ? (
            <button type="button" className="btn" onClick={() => setDraft(draftOf(curve.months))}>
              Edit values
            </button>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={() => setDraft(null)}>
              Discard edits
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || invalid}
            onClick={() => void approve()}
          >
            {draft === null ? 'Approve curve' : 'Save and approve'}
          </button>
        </div>
      </div>
      {invalid && <div className="field-error">Levels are whole numbers from 0 to 100.</div>}
      <div className="table-wrap">
        <table className="table" aria-label={`${curve.destination_name} months`}>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Crowd</th>
              <th scope="col">Price</th>
              <th scope="col">Role</th>
              <th scope="col">Source</th>
            </tr>
          </thead>
          <tbody>
            {curve.months.map((month) => {
              const entry = draft?.[month.month];
              const name = MONTHS[month.month - 1] ?? String(month.month);
              return (
                <tr key={month.month} data-estimated={month.estimated}>
                  <td>
                    <div
                      className="stack"
                      style={{ gap: 'var(--space-4)', alignItems: 'flex-start' }}
                    >
                      <strong>{name}</strong>
                      {month.estimated && (
                        <span className="badge" data-tone="warning">
                          interpolated
                        </span>
                      )}
                      {month.reviewed_at === null && <span className="badge">draft</span>}
                    </div>
                  </td>
                  <td>
                    {entry === undefined ? (
                      <Level value={month.crowd_index} />
                    ) : (
                      <input
                        className="input mono"
                        inputMode="numeric"
                        style={{ width: 72 }}
                        aria-label={`${name} crowd`}
                        value={entry.crowd}
                        onChange={(event) => setField(month.month, 'crowd', event.target.value)}
                      />
                    )}
                  </td>
                  <td>
                    {entry === undefined ? (
                      <div className="stack" style={{ gap: 'var(--space-4)' }}>
                        <Level value={month.price_index} />
                        <span className="muted">{month.price_index_source}</span>
                      </div>
                    ) : (
                      <input
                        className="input mono"
                        inputMode="numeric"
                        style={{ width: 72 }}
                        aria-label={`${name} price`}
                        placeholder="—"
                        value={entry.price}
                        onChange={(event) => setField(month.month, 'price', event.target.value)}
                      />
                    )}
                  </td>
                  <td>
                    <div className="stack" style={{ gap: 'var(--space-4)' }}>
                      <span>{month.colour_role}</span>
                      {month.highlight_tag !== null && (
                        <span className="muted">{month.highlight_tag}</span>
                      )}
                    </div>
                  </td>
                  <td style={{ minWidth: 240 }}>
                    {month.source_url === null ? (
                      month.source
                    ) : (
                      <a href={month.source_url} target="_blank" rel="noreferrer noopener">
                        {month.source}
                      </a>
                    )}
                    <div className="muted">checked {month.sourced_on}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {error !== null && <ErrorState error={error} title="That didn’t go through" />}
    </article>
  );
}
