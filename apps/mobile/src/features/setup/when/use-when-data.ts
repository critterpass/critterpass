/**
 * The dates step's synced inputs: per-date counts, the window options (with any ask this phone
 * has queued shown as asked straight away, and a fare difference read in the crew's currency),
 * and the titles of must-dos a partial week would miss.
 * All local rows, so the step renders offline.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useMemo } from 'react';

import { useCrewMoney } from '../data/crew-money';
import { useLiveRows } from '../data/rows';
import { toOption, type OptionRow, type SummaryRow, type WindowOption } from './model';

const SUMMARIES_SQL = `SELECT date, free_count, maybe_count, busy_count, unknown_count, member_count,
    computed_at
  FROM availability_summaries WHERE trip_id = ? ORDER BY date`;

const OPTIONS_SQL = `SELECT id, position, kind, start_date, end_date, free_count, member_count,
    missing_member_ids, missed_must_do_ids, ask_user_id, ask_status, price_delta_minor, currency,
    reason, is_pick
  FROM date_window_options WHERE trip_id = ? ORDER BY position`;

const PENDING_ASKS_SQL = `SELECT json_extract(envelope, '$.payload.option_id') AS option_id
  FROM commands WHERE cmd = 'ask_availability'
    AND json_extract(envelope, '$.payload.trip_id') = ?`;

const MUST_DOS_SQL = `SELECT id, title FROM must_dos WHERE trip_id = ? AND deleted_at IS NULL`;

export interface WhenData {
  readonly loaded: boolean;
  readonly summaries: readonly SummaryRow[];
  readonly options: readonly WindowOption[];
  readonly mustDoTitles: ReadonlyMap<string, string>;
}

export function useWhenData(tripId: string): WhenData {
  const summaries = useLiveRows<SummaryRow>(SUMMARIES_SQL, [tripId], ['availability_summaries']);
  const options = useLiveRows<OptionRow>(OPTIONS_SQL, [tripId], ['date_window_options']);
  const pending = useLiveRows<{ option_id: string | null }>(
    PENDING_ASKS_SQL,
    [tripId],
    ['commands'],
  );
  const mustDos = useLiveRows<{ id: string; title: string }>(MUST_DOS_SQL, [tripId], ['must_dos']);
  const crewMoney = useCrewMoney(tripId);
  return useMemo(() => {
    const asked = new Set(pending.rows.map((row) => row.option_id));
    return {
      loaded: summaries.loaded && options.loaded,
      summaries: summaries.rows,
      options: options.rows.map((row) => {
        // The stored fare difference is in the fare index's own currency (USD).
        const quoted = toOption(row);
        const delta =
          quoted.priceDeltaMinor === null || quoted.currency === null
            ? null
            : crewMoney.convert(quoted.priceDeltaMinor, quoted.currency);
        const option =
          delta === null
            ? quoted
            : { ...quoted, priceDeltaMinor: delta.amountMinor, currency: delta.currency };
        return option.askState === null && asked.has(option.id)
          ? { ...option, askState: 'asked' as const }
          : option;
      }),
      mustDoTitles: new Map(mustDos.rows.map((row) => [row.id, row.title])),
    };
  }, [summaries, options, pending, mustDos, crewMoney]);
}
