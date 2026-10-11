/**
 * "Today": how much of the day's push budget is used and every push of the day, sent or held, from
 * the synced `ping_ledger` and `notifications` rows (the last 30 days sync to the phone). A held
 * push waits for quiet hours to end; a push past the budget waits for the evening roundup.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, table names and states, never copy. */

export const LEDGER_TODAY_SQL = `SELECT local_date, sent_budgeted FROM ping_ledger
  WHERE user_id = ? AND local_date = ?`;
export const PINGS_TODAY_SQL = `SELECT id, category, class, title, body, is_private, deep_link,
    state, not_before, sent_at, created_at
  FROM notifications WHERE user_id = ? AND local_date = ? ORDER BY created_at DESC, id`;
export const TODAY_TABLES = ['ping_ledger', 'notifications'];

export interface PingRow {
  readonly id: string;
  readonly category: string;
  readonly class: string | null;
  readonly title: string | null;
  readonly body: string | null;
  readonly is_private: number | null;
  readonly deep_link: string | null;
  readonly state: string;
  readonly not_before: string | null;
  readonly sent_at: string | null;
  readonly created_at: string;
}

export type PingStatus = 'sent' | 'held' | 'roundup' | 'sending' | 'dropped' | 'failed';

export interface TodayPing {
  readonly id: string;
  readonly category: string;
  readonly title: string;
  /** Null when the person hides message text: the list says what kind it was, not what it said. */
  readonly body: string | null;
  readonly status: PingStatus;
  /** When it was sent, or when a held one goes out. */
  readonly at: string | null;
  /** Always-on pushes (flight changes, SOS, alarms) never count against the budget. */
  readonly always: boolean;
  readonly deepLink: string | null;
}

export function pingStatus(row: Pick<PingRow, 'state' | 'not_before'>): PingStatus {
  if (row.state === 'sent') return 'sent';
  if (row.state === 'rolled_into_roundup') return 'roundup';
  if (row.state === 'dropped') return 'dropped';
  if (row.state === 'failed') return 'failed';
  return row.not_before === null ? 'sending' : 'held';
}

export function todayPings(rows: readonly PingRow[], hideText: boolean): TodayPing[] {
  return rows
    .filter((row) => row.state !== 'dropped')
    .map((row) => {
      const status = pingStatus(row);
      return {
        id: row.id,
        category: row.category,
        title: row.title ?? '',
        body: hideText || row.is_private === 1 ? null : row.body,
        status,
        at: status === 'held' ? row.not_before : row.sent_at,
        always: row.class === 'always',
        deepLink: row.deep_link,
      };
    });
}

/** "3 of 6 pushes": the budgeted pushes sent today against the day's budget. */
export function budgetUsed(sentBudgeted: number | null | undefined, budget: number) {
  const used = Math.max(0, Math.min(budget, Number(sentBudgeted ?? 0)));
  return { used, budget, full: used >= budget };
}

/** The phone's calendar date (YYYY-MM-DD), the day the ledger counts in. */
export function localDateOf(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
