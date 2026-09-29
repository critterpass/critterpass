/**
 * The worker's side of the money ledger (the api holds the same for its commands; services never
 * import each other): validated appends, the live entries of one source, and the FX run an amount
 * converts at. Entries are only ever inserted; jobs run as app_system.
 */
import {
  type FxContext,
  type LedgerEntryDraft,
  type LedgerSourceKind,
  type StoredLedgerEntry,
} from '@cp/cost-engine';
import { ledgerEntryDraftSchema } from '@cp/domain';
import type pg from 'pg';

export async function appendLedgerEntries(
  tx: pg.PoolClient,
  drafts: readonly LedgerEntryDraft[],
): Promise<void> {
  for (const draft of drafts) {
    const entry = ledgerEntryDraftSchema.parse({
      crew_id: draft.crewId,
      trip_id: draft.tripId,
      debtor_id: draft.debtorId,
      creditor_id: draft.creditorId,
      amount_minor: draft.amountMinor,
      currency: draft.currency,
      source_kind: draft.sourceKind,
      source_id: draft.sourceId,
      reverses_id: draft.reversesId,
    });
    await tx.query(
      `INSERT INTO ledger_entries (crew_id, trip_id, debtor_id, creditor_id, amount_minor, currency,
         source_kind, source_id, reverses_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        entry.crew_id,
        entry.trip_id,
        entry.debtor_id,
        entry.creditor_id,
        entry.amount_minor.toString(),
        entry.currency,
        entry.source_kind,
        entry.source_id,
        entry.reverses_id,
      ],
    );
  }
}

export async function unreversedEntries(
  tx: pg.PoolClient,
  sourceKind: Exclude<LedgerSourceKind, 'reversal'>,
  sourceId: string,
): Promise<StoredLedgerEntry[]> {
  const { rows } = await tx.query<{
    id: string;
    crew_id: string;
    trip_id: string | null;
    debtor_id: string;
    creditor_id: string;
    amount_minor: string;
    currency: string;
    source_id: string;
  }>(
    `SELECT e.id, e.crew_id, e.trip_id, e.debtor_id, e.creditor_id, e.amount_minor::text,
            e.currency, e.source_id
       FROM ledger_entries e
      WHERE e.source_kind = $1 AND e.source_id = $2
        AND NOT EXISTS (SELECT 1 FROM ledger_entries r WHERE r.reverses_id = e.id)
      ORDER BY e.created_at, e.id`,
    [sourceKind, sourceId],
  );
  return rows.map((row) => ({
    id: row.id,
    crewId: row.crew_id,
    tripId: row.trip_id,
    debtorId: row.debtor_id,
    creditorId: row.creditor_id,
    amountMinor: BigInt(row.amount_minor),
    currency: row.currency,
    sourceKind,
    sourceId: row.source_id,
    reversesId: null,
  }));
}

/** The snapshots of one run relating `from` and `to`: `snapshotId`'s run, else the newest. */
export async function fxRun(
  tx: pg.PoolClient,
  snapshotId: string | null,
  from: string,
  to: string,
): Promise<FxContext | undefined> {
  const { rows: runs } = await tx.query<{ id: string; as_of: string; source: string }>(
    snapshotId === null
      ? `SELECT s.id, s.as_of::text AS as_of, s.source FROM fx_snapshots s
          WHERE (s.base = $1 OR s.quote = $1)
            AND EXISTS (SELECT 1 FROM fx_snapshots o WHERE o.as_of = s.as_of
                          AND o.source = s.source AND (o.base = $2 OR o.quote = $2))
          ORDER BY s.as_of DESC, s.id LIMIT 1`
      : 'SELECT id, as_of::text AS as_of, source FROM fx_snapshots WHERE id = $1',
    snapshotId === null ? [from, to] : [snapshotId],
  );
  const run = runs[0];
  if (run === undefined) return undefined;
  const { rows } = await tx.query<{ base: string; quote: string; rate: string; as_of: string }>(
    `SELECT base, quote, rate::text AS rate, as_of::text AS as_of FROM fx_snapshots
      WHERE as_of = $1 AND source = $2 AND (base = ANY($3::text[]) OR quote = ANY($3::text[]))`,
    [run.as_of, run.source, [from, to]],
  );
  return {
    snapshotId: run.id,
    snapshots: rows.map((row) => ({
      base: row.base,
      quote: row.quote,
      rate: row.rate,
      asOf: row.as_of,
      source: run.source,
    })),
  };
}
