/**
 * A user's net per crew and currency, straight from the ledger (the same sum `member_balances`
 * gives each member): positive = the crew owes them, negative = they owe the crew. Read as the
 * system so a crew the user has already left still counts.
 */
import type pg from 'pg';

export interface CrewBalance {
  readonly crewId: string;
  readonly crewName: string;
  readonly currency: string;
  readonly netMinor: number;
}

export async function crewBalances(tx: pg.PoolClient, uid: string): Promise<CrewBalance[]> {
  const { rows } = await tx.query<{
    crew_id: string;
    crew_name: string;
    currency: string;
    net_minor: string;
  }>(
    `SELECT l.crew_id, c.name AS crew_name, l.currency,
            sum(CASE WHEN l.creditor_id = $1 THEN l.amount_minor ELSE -l.amount_minor END)::text
              AS net_minor
       FROM ledger_entries l JOIN crews c ON c.id = l.crew_id
      WHERE l.creditor_id = $1 OR l.debtor_id = $1
      GROUP BY l.crew_id, c.name, l.currency
     HAVING sum(CASE WHEN l.creditor_id = $1 THEN l.amount_minor ELSE -l.amount_minor END) <> 0
      ORDER BY c.name, l.currency`,
    [uid],
  );
  return rows.map((row) => ({
    crewId: row.crew_id,
    crewName: row.crew_name,
    currency: row.currency,
    netMinor: Number(row.net_minor),
  }));
}
