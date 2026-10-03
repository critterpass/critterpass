/**
 * The ledger contributor: the receipt (3m-6) from the trip's live expenses in the crew's settlement
 * currency, the locked sweet spot it is held against, and whether the crew is square, from the
 * trip's ledger entries and confirmed payments. Per traveller: the expenses they logged.
 */
import { RECAP_RECEIPT_CATEGORIES, type RecapReceipt } from '@cp/domain';
import type pg from 'pg';

import { addMetric, dayNoOf, type RecapContributor, type RecapScope } from './types';

type Category = (typeof RECAP_RECEIPT_CATEGORIES)[number];

interface ExpenseRow {
  readonly id: string;
  readonly amount: string;
  readonly category: string;
  readonly description: string | null;
  readonly merchant: string | null;
  readonly local_date: string;
  readonly created_by: string | null;
}

/** `amount / count`, rounded half away from zero, in integers. */
function divideRounded(amount: number, count: number): number {
  const sign = amount < 0 ? -1 : 1;
  const magnitude = Math.abs(amount);
  return sign * Math.floor((2 * magnitude + count) / (2 * count));
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

async function loadExpenses(tx: pg.PoolClient, scope: RecapScope): Promise<ExpenseRow[]> {
  const { rows } = await tx.query<ExpenseRow>(
    `SELECT id, crew_amount_minor::text AS amount, category, description, merchant,
            local_date::text AS local_date, created_by
       FROM expenses
      WHERE trip_id = $1 AND deleted_at IS NULL AND crew_currency = $2
      ORDER BY spent_at NULLS LAST, id`,
    [scope.trip.id, scope.trip.currency],
  );
  return rows;
}

async function outstanding(tx: pg.PoolClient, scope: RecapScope) {
  const { rows } = await tx.query<{ owed: string; entries: number }>(
    `SELECT coalesce(sum(greatest(-net, 0)), 0)::text AS owed, count(*)::int AS entries FROM (
       SELECT member, sum(delta) AS net FROM (
         SELECT creditor_id AS member, amount_minor AS delta FROM ledger_entries
          WHERE trip_id = $1 AND currency = $2
         UNION ALL
         SELECT debtor_id, -amount_minor FROM ledger_entries WHERE trip_id = $1 AND currency = $2
       ) moves GROUP BY member
     ) nets`,
    [scope.trip.id, scope.trip.currency],
  );
  return { owed: Number(rows[0]?.owed ?? 0), members: rows[0]?.entries ?? 0 };
}

async function lastConfirmedOn(tx: pg.PoolClient, scope: RecapScope): Promise<string | null> {
  const { rows } = await tx.query<{ day: string | null }>(
    `SELECT (max(confirmed_at) AT TIME ZONE $2)::date::text AS day FROM payments
      WHERE trip_id = $1 AND status = 'confirmed'`,
    [scope.trip.id, scope.trip.tz],
  );
  return rows[0]?.day ?? null;
}

async function plannedEach(tx: pg.PoolClient, scope: RecapScope): Promise<number | null> {
  const { rows } = await tx.query<{ target: string }>(
    'SELECT target_minor::text AS target FROM budget_plans WHERE trip_id = $1 AND currency = $2',
    [scope.trip.id, scope.trip.currency],
  );
  const target = rows[0]?.target;
  return target === undefined ? null : Number(target);
}

export const ledgerContributor: RecapContributor = {
  name: 'ledger',
  async contribute(tx, scope, draft) {
    const expenses = await loadExpenses(tx, scope);
    const travellers = Math.max(1, scope.members.length);
    const lines = new Map<Category, { total: number; count: number }>();
    const byDay = new Map<string, number>();
    let total = 0;
    let priciest: RecapReceipt['priciest'] = null;
    for (const row of expenses) {
      const amount = Number(row.amount);
      const category: Category = (RECAP_RECEIPT_CATEGORIES as readonly string[]).includes(
        row.category,
      )
        ? (row.category as Category)
        : 'other';
      const line = lines.get(category) ?? { total: 0, count: 0 };
      lines.set(category, { total: line.total + amount, count: line.count + 1 });
      total += amount;
      if (row.local_date >= scope.trip.startDate && row.local_date <= scope.trip.endedOn) {
        byDay.set(row.local_date, (byDay.get(row.local_date) ?? 0) + amount);
      }
      if (priciest === null || amount > priciest.amount_minor) {
        priciest = {
          expense_id: row.id,
          description: row.description ?? row.merchant ?? category,
          amount_minor: amount,
        };
      }
      if (row.created_by !== null && scope.members.includes(row.created_by)) {
        addMetric(draft, row.created_by, 'expenses_logged', 1);
      }
    }

    let cheapest: RecapReceipt['cheapest_day'] = null;
    for (const [localDate, amount] of [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const each = divideRounded(amount, travellers);
      if (amount > 0 && (cheapest === null || each < cheapest.each_minor)) {
        cheapest = {
          day_no: dayNoOf(scope.trip, localDate),
          local_date: localDate,
          each_minor: each,
        };
      }
    }

    const planned = await plannedEach(tx, scope);
    const balance = await outstanding(tx, scope);
    const settled = balance.owed === 0;
    const settledOn = settled && balance.members > 0 ? await lastConfirmedOn(tx, scope) : null;
    draft.receipt = {
      currency: scope.trip.currency,
      lines: RECAP_RECEIPT_CATEGORIES.flatMap((category) => {
        const line = lines.get(category);
        return line === undefined ? [] : [{ category, total_minor: line.total, count: line.count }];
      }),
      total_minor: total,
      expenses: expenses.length,
      meals: lines.get('food')?.count ?? 0,
      travellers,
      each_minor: divideRounded(total, travellers),
      planned_each_minor: planned,
      planned_total_minor: planned === null ? null : planned * travellers,
      under_minor: planned === null ? null : planned * travellers - total,
      priciest,
      cheapest_day: cheapest,
      outstanding_minor: balance.owed,
      settled,
      settled_on: settledOn,
      settled_days_after_end:
        settledOn === null ? null : daysBetween(scope.trip.endedOn, settledOn),
    };
  },
};
