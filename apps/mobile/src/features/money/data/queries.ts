/**
 * The local queries Money reads. Everything is a synced row (or the offline command queue), so
 * every money screen renders offline; amounts are integers in minor units and stay exact.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire values, never copy. */

export const UID_SQL = 'SELECT value FROM local_state WHERE id = ?';
export const UID_TABLES = ['local_state'];

export const PROFILE_SQL = `SELECT u.display_name, u.home_currency, u.home_country, s.active_crew_id
  FROM users u LEFT JOIN user_settings s ON s.user_id = u.id WHERE u.id = ?`;
export const PROFILE_TABLES = ['users', 'user_settings'];

/** `ledger_currency`: what the crew's newest ledger entry is in, for a crew with no currency. */
export const CREWS_SQL = `SELECT c.id, c.name, c.settlement_currency, m.role,
    (SELECT l.currency FROM ledger_entries l WHERE l.crew_id = c.id ORDER BY l.id DESC LIMIT 1)
      AS ledger_currency
  FROM crew_members m JOIN crews c ON c.id = m.crew_id
  WHERE m.user_id = ? AND m.status = 'active' ORDER BY m.created_at, c.id`;
export const CREWS_TABLES = ['crews', 'crew_members', 'ledger_entries'];

/** Every member the crew has had: ledger rows keep naming people who left. */
export const MEMBERS_SQL = `SELECT m.user_id, m.colour, m.status, u.display_name
  FROM crew_members m LEFT JOIN users u ON u.id = m.user_id
  WHERE m.crew_id = ? ORDER BY m.created_at, m.user_id`;
export const MEMBERS_TABLES = ['crew_members', 'users'];

export const TRIPS_SQL = `SELECT t.id, t.status, t.start_date, t.end_date, coalesce(t.tz, d.tz) AS tz,
    t.local_currency, t.trip_length_days, t.current_version_id, d.name AS destination_name,
    p.role AS my_role
  FROM trips t
  LEFT JOIN destinations d ON d.id = t.destination_id
  LEFT JOIN trip_participants p ON p.trip_id = t.id AND p.user_id = ?
  WHERE t.crew_id = ? AND t.status <> 'cancelled'
  ORDER BY t.start_date DESC, t.id`;
export const TRIPS_TABLES = ['trips', 'destinations', 'trip_participants'];

export const PARTICIPANTS_SQL = `SELECT user_id FROM trip_participants
  WHERE trip_id = ? AND coalesce(holds_seat, 1) = 1 ORDER BY created_at, user_id`;
export const PARTICIPANTS_TABLES = ['trip_participants'];

export const EXPENSES_SQL = `SELECT id, payer_id, amount_minor, currency, fx_snapshot_id,
    crew_amount_minor, crew_currency, split_mode, category, description, merchant, local_date,
    trip_day, spent_at, receipt_id, source, created_by, version, created_at
  FROM expenses WHERE trip_id = ? AND deleted_at IS NULL
  ORDER BY spent_at DESC, created_at DESC, id DESC`;
export const EXPENSES_TABLES = ['expenses'];

export const SHARES_SQL = `SELECT expense_id, user_id, weight, fixed_minor, computed_minor,
    crew_computed_minor, excluded_reason
  FROM expense_shares WHERE trip_id = ?`;
export const SHARES_TABLES = ['expense_shares'];

export const EDITS_SQL = `SELECT id, editor_id, kind, before, after, at FROM expense_edits
  WHERE expense_id = ? ORDER BY at DESC, id DESC`;
export const EDITS_TABLES = ['expense_edits'];

export const LEDGER_SQL = `SELECT debtor_id, creditor_id, amount_minor, currency FROM ledger_entries
  WHERE crew_id = ? AND trip_id = ?`;
export const LEDGER_TABLES = ['ledger_entries'];

export const PAYMENTS_SQL = `SELECT id, from_id, to_id, amount_minor, currency, method, status,
    requested_at, last_nudged_at, marked_at, confirmed_at, auto_confirmed, disputed_at,
    dispute_note, reissued_from_id, version, updated_at
  FROM payments WHERE trip_id = ? ORDER BY created_at, id`;
export const PAYMENTS_TABLES = ['payments'];

/** Every rate of the newest FX run that relates the two currencies (the server picks the same). */
export const FX_RUN_SQL = `SELECT id, base, quote, rate, as_of, source FROM fx_snapshots
  WHERE (as_of, source) = (
    SELECT s.as_of, s.source FROM fx_snapshots s
     WHERE (s.base = ?1 OR s.quote = ?1)
       AND EXISTS (SELECT 1 FROM fx_snapshots o WHERE o.as_of = s.as_of AND o.source = s.source
                     AND (o.base = ?2 OR o.quote = ?2))
     ORDER BY s.as_of DESC, s.id LIMIT 1)
  ORDER BY id`;
export const FX_TABLES = ['fx_snapshots'];

export const FX_BY_ID_SQL =
  'SELECT id, base, quote, rate, as_of, source FROM fx_snapshots WHERE id = ?';

export const BUDGET_SQL = `SELECT target_minor, currency, breakdown, planned_by_day, version
  FROM budget_plans WHERE trip_id = ?`;
export const BUDGET_TABLES = ['budget_plans'];

export const PLAN_ITEMS_SQL = `SELECT i.id, i.starts_at, i.tz, i.category, i.amount_minor, i.currency,
    i.status, i.poi_id, i.attendee_ids, p.name AS poi_name
  FROM plan_items i LEFT JOIN pois p ON p.id = i.poi_id
  WHERE i.trip_id = ? AND i.version_id = ? AND i.status <> 'cancelled'
  ORDER BY i.starts_at, i.id`;
export const PLAN_ITEMS_TABLES = ['plan_items', 'pois'];

export const SETTLED_STICKER_SQL = `SELECT id, granted_at FROM stickers
  WHERE user_id = ? AND trip_id = ? AND kind = 'settled' LIMIT 1`;
export const STICKER_TABLES = ['stickers'];

export const RECEIPT_SQL = `SELECT id, status, quality_issue, ocr_source, ocr_lines, parsed,
    suggestions, failure_reason, expense_id FROM receipts WHERE id = ?`;
export const RECEIPT_TABLES = ['receipts'];

/** Money commands still in the offline queue (or sent and waiting for their synced rows). */
export const PENDING_MONEY_SQL = `SELECT id, cmd, envelope, status, created_at FROM commands
  WHERE cmd IN ('add_expense', 'edit_expense', 'delete_expense', 'mark_paid', 'confirm_paid',
                'request_payment', 'dispute_payment')
  ORDER BY seq`;
export const PENDING_TABLES = ['commands'];

export interface ProfileRow {
  readonly display_name: string | null;
  readonly home_currency: string | null;
  readonly home_country: string | null;
  readonly active_crew_id: string | null;
}

export interface CrewRow {
  readonly id: string;
  readonly name: string | null;
  readonly settlement_currency: string | null;
  readonly role: string | null;
  readonly ledger_currency?: string | null;
}

export interface MemberRow {
  readonly user_id: string;
  readonly colour: string | null;
  readonly status: string | null;
  readonly display_name: string | null;
}

export interface TripRow {
  readonly id: string;
  readonly status: string;
  readonly start_date: string | null;
  readonly end_date: string | null;
  readonly tz: string | null;
  readonly local_currency: string | null;
  readonly trip_length_days: number | null;
  readonly current_version_id: string | null;
  readonly destination_name: string | null;
  readonly my_role: string | null;
}

export interface ExpenseRow {
  readonly id: string;
  readonly payer_id: string;
  readonly amount_minor: number;
  readonly currency: string;
  readonly fx_snapshot_id: string | null;
  readonly crew_amount_minor: number;
  readonly crew_currency: string;
  readonly split_mode: string;
  readonly category: string | null;
  readonly description: string | null;
  readonly merchant: string | null;
  readonly local_date: string | null;
  readonly trip_day: number | null;
  readonly spent_at: string | null;
  readonly receipt_id: string | null;
  readonly source: string | null;
  readonly created_by: string | null;
  readonly version: number | null;
  readonly created_at: string | null;
}

export interface ShareRow {
  readonly expense_id: string;
  readonly user_id: string;
  readonly weight: number | null;
  readonly fixed_minor: number | null;
  readonly computed_minor: number | null;
  readonly crew_computed_minor: number | null;
  readonly excluded_reason: string | null;
}

export interface EditRow {
  readonly id: string;
  readonly editor_id: string | null;
  readonly kind: string;
  readonly before: string | null;
  readonly after: string | null;
  readonly at: string;
}

export interface LedgerRow {
  readonly debtor_id: string;
  readonly creditor_id: string;
  readonly amount_minor: number;
  readonly currency: string;
}

export interface PaymentRow {
  readonly id: string;
  readonly from_id: string;
  readonly to_id: string;
  readonly amount_minor: number;
  readonly currency: string;
  readonly method: string | null;
  readonly status: string;
  readonly requested_at: string | null;
  readonly last_nudged_at: string | null;
  readonly marked_at: string | null;
  readonly confirmed_at: string | null;
  readonly auto_confirmed: number | null;
  readonly disputed_at: string | null;
  readonly dispute_note: string | null;
  readonly reissued_from_id: string | null;
  readonly version: number | null;
  readonly updated_at: string | null;
}

export interface FxRow {
  readonly id: string;
  readonly base: string;
  readonly quote: string;
  readonly rate: string | number;
  readonly as_of: string;
  readonly source: string;
}

export interface BudgetRow {
  readonly target_minor: number;
  readonly currency: string;
  readonly breakdown: string | null;
  readonly planned_by_day: string | null;
  readonly version: number | null;
}

export interface PlanItemRow {
  readonly id: string;
  readonly starts_at: string | null;
  readonly tz: string | null;
  readonly category: string | null;
  readonly amount_minor: number | null;
  readonly currency: string | null;
  readonly status: string | null;
  readonly poi_id: string | null;
  readonly attendee_ids: string | null;
  readonly poi_name: string | null;
}

export interface ReceiptRow {
  readonly id: string;
  readonly status: string;
  readonly quality_issue: string | null;
  readonly ocr_source: string | null;
  readonly ocr_lines: string | null;
  readonly parsed: string | null;
  readonly suggestions: string | null;
  readonly failure_reason: string | null;
  readonly expense_id: string | null;
}

export interface PendingCommandRow {
  readonly id: string;
  readonly cmd: string;
  readonly envelope: string;
  readonly status: string;
  readonly created_at: string | null;
}

/** A synced integer column as an exact bigint (SQLite hands integers back as JS numbers). */
export function minor(value: number | string | null | undefined): bigint {
  if (value === null || value === undefined) return 0n;
  return BigInt(value);
}

/** Parses a synced JSON column; `fallback` for null or malformed text. */
export function json<T>(text: string | null | undefined, fallback: T): T {
  if (text === null || text === undefined || text === '') return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}
