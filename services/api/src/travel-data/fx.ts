/**
 * FX from stored Frankfurter snapshots for the destination page's chip ("¥1,000 ≈ $6.70") and the
 * `fx` tool. Arithmetic is `@cp/cost-engine`'s exact conversion: a direct pair (either direction)
 * when one exists, else a cross rate through a shared base from the same day. No snapshot → `null`,
 * never a guessed rate.
 */
import {
  assertCurrencyCode,
  convert,
  convertViaBase,
  currencyExponent,
  ESTIMATE_CASH_STEP_MAJOR,
  isKnownCurrency,
  isStaleSnapshot,
  money,
  type FxSnapshot,
} from '@cp/cost-engine';
import type pg from 'pg';

export interface FxConversion {
  readonly from: { readonly amount_minor: number; readonly currency: string };
  readonly to: { readonly amount_minor: number; readonly currency: string };
  /** Units of `to` per one unit of `from` (for display only; amounts come from exact math). */
  readonly rate: number;
  readonly snapshot_id: string;
  readonly as_of: string;
  readonly source: string;
  readonly stale: boolean;
}

interface SnapshotRow {
  readonly id: string;
  readonly base: string;
  readonly quote: string;
  readonly rate: string;
  readonly as_of: string;
  readonly source: string;
}

function snapshot(row: SnapshotRow): FxSnapshot {
  return {
    base: assertCurrencyCode(row.base),
    quote: assertCurrencyCode(row.quote),
    rate: row.rate,
    asOf: row.as_of,
    source: row.source,
  };
}

const SNAPSHOT_COLUMNS = 'id, base, quote, rate::text, as_of::text, source';

async function latestDirect(tx: pg.PoolClient, a: string, b: string) {
  const { rows } = await tx.query<SnapshotRow>(
    `SELECT ${SNAPSHOT_COLUMNS} FROM fx_snapshots
      WHERE (base = $1 AND quote = $2) OR (base = $2 AND quote = $1)
      ORDER BY as_of DESC, source LIMIT 1`,
    [a, b],
  );
  return rows[0];
}

async function latestCross(tx: pg.PoolClient, from: string, to: string) {
  const { rows } = await tx.query<SnapshotRow & { to_id: string; to_rate: string }>(
    `SELECT f.id, f.base, f.quote, f.rate::text, f.as_of::text, f.source,
            t.id AS to_id, t.rate::text AS to_rate
       FROM fx_snapshots f
       JOIN fx_snapshots t ON t.base = f.base AND t.as_of = f.as_of AND t.source = f.source
      WHERE f.quote = $1 AND t.quote = $2
      ORDER BY f.as_of DESC LIMIT 1`,
    [from, to],
  );
  return rows[0];
}

/** Converts `amountMinor` of `from` into `to`, or `null` when no snapshot relates them. */
export async function convertWithSnapshots(
  tx: pg.PoolClient,
  amountMinor: number,
  from: string,
  to: string,
  now: Date = new Date(),
): Promise<FxConversion | null> {
  if (!isKnownCurrency(from) || !isKnownCurrency(to) || from === to) return null;
  const source = money(BigInt(amountMinor), from);
  const direct = await latestDirect(tx, from, to);
  if (direct !== undefined) {
    const snap = snapshot(direct);
    const converted = convert(source, assertCurrencyCode(to), snap);
    const rate = direct.base === from ? Number(direct.rate) : 1 / Number(direct.rate);
    return result(amountMinor, from, converted.amountMinor, to, rate, direct, snap, now);
  }
  const cross = await latestCross(tx, from, to);
  if (cross === undefined) return null;
  const fromBase = snapshot(cross);
  const toBase = snapshot({ ...cross, id: cross.to_id, quote: to, rate: cross.to_rate });
  const converted = convertViaBase(source, assertCurrencyCode(to), fromBase, toBase);
  return result(
    amountMinor,
    from,
    converted.amountMinor,
    to,
    Number(cross.to_rate) / Number(cross.rate),
    { ...cross, id: cross.to_id },
    fromBase,
    now,
  );
}

function result(
  amountMinor: number,
  from: string,
  convertedMinor: bigint,
  to: string,
  /** Major units of `to` per major unit of `from`, from the snapshot rates (display only). */
  rate: number,
  row: SnapshotRow,
  snap: FxSnapshot,
  now: Date,
): FxConversion {
  return {
    from: { amount_minor: amountMinor, currency: from },
    to: { amount_minor: Number(convertedMinor), currency: to },
    rate: Number(rate.toPrecision(8)),
    snapshot_id: row.id,
    as_of: row.as_of,
    source: row.source,
    stale: isStaleSnapshot(snap, now),
  };
}

/**
 * How many whole local units the chip converts: the smallest power of ten that is a sum people
 * hand over in the local cash (never under its cash step: Rp1,000, not Rp1) and that is worth a
 * sum people quote in the reader's currency (at least one unit, or its cash step: ₫1,000). So
 * "¥1,000 ≈ $6.70" and "Rp1,000 ≈ ₫1,600" rather than "¥1 ≈ $0.01" or "Rp1 ≈ ₫1".
 */
export function chipUnits(rate: number, local: string, home: string): number {
  const step = (code: string) => Number(ESTIMATE_CASH_STEP_MAJOR[assertCurrencyCode(code)] ?? 1n);
  const atLeast = Math.max(step(local), rate > 0 ? step(home) / rate : 1);
  return atLeast <= 1 ? 1 : 10 ** Math.ceil(Math.log10(atLeast) - 1e-9);
}

/** The destination chip: `chipUnits` of the local currency in the reader's. */
export async function fxChip(
  tx: pg.PoolClient,
  local: string,
  home: string,
  now: Date = new Date(),
): Promise<FxConversion | null> {
  if (!isKnownCurrency(local)) return null;
  const unit = 10 ** currencyExponent(assertCurrencyCode(local));
  const probe = await convertWithSnapshots(tx, unit, local, home, now);
  if (probe === null) return null;
  const units = chipUnits(probe.rate, local, home);
  return units === 1 ? probe : convertWithSnapshots(tx, unit * units, local, home, now);
}
