/** The synced rows the crew's boost card reads: the boost, its split's shares, the trip's money. */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
export const CARD_BOOST_SQL = `SELECT b.id, b.trip_id, b.crew_id, b.buyer_id, b.status, b.split_mode,
    b.split_member_ids, b.thanked_by, b.created_at, u.display_name AS buyer_name,
    d.name AS destination, c.name AS crew, t.start_date, t.end_date,
    g.slug AS guide_slug, g.name AS guide_name
  FROM trip_boosts b
  LEFT JOIN users u ON u.id = b.buyer_id
  LEFT JOIN trips t ON t.id = b.trip_id
  LEFT JOIN destinations d ON d.id = t.destination_id
  LEFT JOIN crews c ON c.id = b.crew_id
  LEFT JOIN guides g ON g.id = t.guide_id
  WHERE b.id = ?`;
export const CARD_BOOST_TABLES = [
  'trip_boosts',
  'users',
  'trips',
  'destinations',
  'crews',
  'guides',
];

export interface CardBoostRow {
  readonly id: string;
  readonly trip_id: string;
  readonly crew_id: string;
  readonly buyer_id: string | null;
  readonly status: string;
  readonly split_mode: string | null;
  readonly split_member_ids: string | null;
  readonly thanked_by: string | null;
  readonly created_at: string;
  readonly buyer_name: string | null;
  readonly destination: string | null;
  readonly crew: string | null;
  readonly start_date: string | null;
  readonly end_date: string | null;
  readonly guide_slug: string | null;
  readonly guide_name: string | null;
}

export const CARD_SHARES_SQL = `SELECT e.id AS expense_id, e.crew_currency, s.user_id, s.computed_minor, e.currency,
    u.display_name
  FROM expenses e
  JOIN expense_shares s ON s.expense_id = e.id
  LEFT JOIN users u ON u.id = s.user_id
  WHERE e.boost_id = ? AND e.deleted_at IS NULL
  ORDER BY s.created_at, s.user_id`;
export const CARD_SHARES_TABLES = ['expenses', 'expense_shares', 'users'];

export interface CardShareRow {
  readonly expense_id: string;
  readonly crew_currency: string | null;
  readonly user_id: string;
  readonly computed_minor: number | string | null;
  readonly currency: string;
  readonly display_name: string | null;
}

export const CARD_LEDGER_SQL = `SELECT debtor_id, creditor_id, amount_minor, currency, source_kind,
    source_id FROM ledger_entries WHERE trip_id = ?`;
export const CARD_LEDGER_TABLES = ['ledger_entries'];

export interface CardLedgerRow {
  readonly debtor_id: string;
  readonly creditor_id: string;
  readonly amount_minor: number | string;
  readonly currency: string;
  readonly source_kind: string;
  readonly source_id: string;
}

export const CARD_PAYMENTS_SQL = `SELECT from_id, to_id, amount_minor, currency, status FROM payments
  WHERE trip_id = ?`;
export const CARD_PAYMENTS_TABLES = ['payments'];

export interface CardPaymentRow {
  readonly from_id: string;
  readonly to_id: string;
  readonly amount_minor: number | string;
  readonly currency: string;
  readonly status: string;
}

/** PowerSync replicates a Postgres array as JSON text (an older replica as `{a,b}`). */
export function uuidList(value: string | null | undefined): string[] {
  if (value === null || value === undefined || value === '') return [];
  if (value.startsWith('{')) {
    const inner = value.slice(1, -1).trim();
    return inner === '' ? [] : inner.split(',').map((item) => item.replace(/^"|"$/gu, ''));
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}
