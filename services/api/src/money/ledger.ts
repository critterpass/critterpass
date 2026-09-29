/**
 * The ledger's database side, shared by every money writer (expenses, payments, the Boost split's
 * IOUs and the re-rate job's twin in the worker): validated appends, the live (unreversed) entries
 * of one source, and the FX run an amount converts at. Entries are only ever inserted; a change is
 * a reversal plus new entries, written as the system after the caller's policy check.
 */
import {
  type FxContext,
  type LedgerEntryDraft,
  type LedgerSourceKind,
  type StoredLedgerEntry,
} from '@cp/cost-engine';
import { DomainError, ledgerEntryDraftSchema } from '@cp/domain';
import type pg from 'pg';

interface LedgerRow {
  readonly id: string;
  readonly crew_id: string;
  readonly trip_id: string | null;
  readonly debtor_id: string;
  readonly creditor_id: string;
  readonly amount_minor: string;
  readonly currency: string;
  readonly source_kind: LedgerSourceKind;
  readonly source_id: string;
  readonly reverses_id: string | null;
}

function toStored(row: LedgerRow): StoredLedgerEntry {
  return {
    id: row.id,
    crewId: row.crew_id,
    tripId: row.trip_id,
    debtorId: row.debtor_id,
    creditorId: row.creditor_id,
    amountMinor: BigInt(row.amount_minor),
    currency: row.currency,
    sourceKind: row.source_kind,
    sourceId: row.source_id,
    reversesId: row.reverses_id,
  };
}

/** Appends entries (must run as app_system); each is checked against the shared contract first. */
export async function writeLedgerEntries(
  tx: pg.PoolClient,
  drafts: readonly LedgerEntryDraft[],
): Promise<string[]> {
  const ids: string[] = [];
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
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO ledger_entries (crew_id, trip_id, debtor_id, creditor_id, amount_minor, currency,
         source_kind, source_id, reverses_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
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
    if (rows[0] !== undefined) ids.push(rows[0].id);
  }
  return ids;
}

/** The entries of one source that no reversal has cancelled yet. */
export async function liveEntries(
  tx: pg.PoolClient,
  sourceKind: Exclude<LedgerSourceKind, 'reversal'>,
  sourceId: string,
): Promise<StoredLedgerEntry[]> {
  const { rows } = await tx.query<LedgerRow>(
    `SELECT e.id, e.crew_id, e.trip_id, e.debtor_id, e.creditor_id, e.amount_minor::text,
            e.currency, e.source_kind, e.source_id, e.reverses_id
       FROM ledger_entries e
      WHERE e.source_kind = $1 AND e.source_id = $2
        AND NOT EXISTS (SELECT 1 FROM ledger_entries r WHERE r.reverses_id = e.id)
      ORDER BY e.created_at, e.id`,
    [sourceKind, sourceId],
  );
  return rows.map(toStored);
}

interface SnapshotRow {
  readonly id: string;
  readonly base: string;
  readonly quote: string;
  readonly rate: string;
  readonly as_of: string;
  readonly source: string;
}

/**
 * The FX run an amount in `from` converts to `to` at: the run of `snapshotId` when the client
 * pinned one (offline, its latest cached snapshot), else the newest run that relates the two.
 * `undefined` when the currencies match. The returned `snapshotId` is what the expense stores.
 */
export async function loadFxContext(
  tx: pg.PoolClient,
  snapshotId: string | null,
  from: string,
  to: string,
): Promise<FxContext | undefined> {
  if (from === to) return undefined;
  let run: { as_of: string; source: string; id: string } | undefined;
  if (snapshotId !== null) {
    const { rows } = await tx.query<{ as_of: string; source: string; id: string }>(
      'SELECT id, as_of::text AS as_of, source FROM fx_snapshots WHERE id = $1',
      [snapshotId],
    );
    run = rows[0];
    if (run === undefined) throw new DomainError('VALIDATION', { reason: 'fx_snapshot_unknown' });
  } else {
    const { rows } = await tx.query<{ as_of: string; source: string; id: string }>(
      `SELECT s.id, s.as_of::text AS as_of, s.source FROM fx_snapshots s
        WHERE (s.base = $1 OR s.quote = $1)
          AND EXISTS (SELECT 1 FROM fx_snapshots o
                       WHERE o.as_of = s.as_of AND o.source = s.source
                         AND (o.base = $2 OR o.quote = $2))
        ORDER BY s.as_of DESC, s.id LIMIT 1`,
      [from, to],
    );
    run = rows[0];
    if (run === undefined) throw new DomainError('VALIDATION', { reason: 'fx_rate_missing' });
  }
  const { rows } = await tx.query<SnapshotRow>(
    `SELECT id, base, quote, rate::text AS rate, as_of::text AS as_of, source FROM fx_snapshots
      WHERE as_of = $1 AND source = $2
        AND (base = ANY($3::text[]) OR quote = ANY($3::text[]))`,
    [run.as_of, run.source, [from, to]],
  );
  return {
    snapshotId: run.id,
    snapshots: rows.map((row) => ({
      base: row.base,
      quote: row.quote,
      rate: row.rate,
      asOf: row.as_of,
      source: row.source,
    })),
  };
}
