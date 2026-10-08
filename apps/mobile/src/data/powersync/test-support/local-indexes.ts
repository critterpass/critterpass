/**
 * The indexes the phone builds on synced tables, read by `synced-schema-source.ts`. PowerSync keeps
 * every synced row as JSON (`ps_data__<table>(id, data)`), so a filter on anything but `id` reads
 * the whole table unless an index is declared here; each one is an expression index over the
 * extracted columns, built when the database next opens.
 *
 * Add one only for a filter a live query runs on a table that grows: every index is written again
 * for each synced row. Columns are ascending (SQLite reads them backwards for `DESC`).
 */
/* eslint-disable lingui/no-unlocalized-strings -- table, index and column names, never copy. */

export interface LocalIndex {
  readonly table: string;
  /** Unique per table; SQLite names the index `ps_data__<table>__<name>`. */
  readonly name: string;
  readonly columns: readonly string[];
  /** The query this index is for, so an index nobody reads any more is easy to spot. */
  readonly serves: string;
}

export const LOCAL_INDEXES: readonly LocalIndex[] = [
  {
    table: 'messages',
    name: 'crew_seq',
    columns: ['crew_id', 'seq'],
    serves:
      'chat timeline (newest messages of a crew by seq), unread count (seq above the read marker), last message per crew card',
  },
  {
    table: 'message_reactions',
    name: 'message',
    columns: ['message_id'],
    serves: 'reactions on the messages the chat timeline has loaded',
  },
  {
    table: 'crew_members',
    name: 'crew_user',
    columns: ['crew_id', 'user_id'],
    serves: "a crew's members (home, chat, money, plan), one member's read marker, inbox actor",
  },
  {
    table: 'crew_members',
    name: 'user',
    columns: ['user_id'],
    serves: 'the crews the signed-in member belongs to (home, money, explore, trip count)',
  },
  {
    table: 'trips',
    name: 'crew',
    columns: ['crew_id'],
    serves: "a crew's trips and its next trip (home, money)",
  },
  {
    table: 'trip_participants',
    name: 'trip_user',
    columns: ['trip_id', 'user_id'],
    serves: "a trip's participants and the signed-in member's seat on it (hub, plan, money, album)",
  },
  {
    table: 'plan_days',
    name: 'version',
    columns: ['version_id'],
    serves: 'the days of one itinerary version (trip plan, hub, album)',
  },
  {
    table: 'plan_items',
    name: 'version',
    columns: ['version_id'],
    serves: 'the stops of one itinerary version (trip plan, hub next stops, map, money estimate)',
  },
  {
    table: 'bookings',
    name: 'trip',
    columns: ['trip_id'],
    serves: "a trip's bookings and flights (hub)",
  },
  {
    table: 'expenses',
    name: 'trip',
    columns: ['trip_id'],
    serves: "a trip's expenses (money)",
  },
  {
    table: 'expense_shares',
    name: 'trip',
    columns: ['trip_id'],
    serves: "the shares of a trip's expenses (money)",
  },
  {
    table: 'ledger_entries',
    name: 'trip',
    columns: ['trip_id'],
    serves: "a trip's balances (money, hub)",
  },
  {
    table: 'payments',
    name: 'trip',
    columns: ['trip_id'],
    serves: "a trip's settle-up payments (money)",
  },
  {
    table: 'photos',
    name: 'trip',
    columns: ['trip_id'],
    serves: "a trip's album grid and viewer",
  },
  {
    table: 'activity_events',
    name: 'trip_at',
    columns: ['trip_id', 'at'],
    serves: "the hub's newest activity of a trip",
  },
  {
    table: 'inbox_items',
    name: 'user_created',
    columns: ['user_id', 'created_at'],
    serves: 'inbox pages (newest first) and the needs-you count on home',
  },
  {
    table: 'pois',
    name: 'destination',
    columns: ['destination_id'],
    serves: "a destination's places (explore map, list, kinds and picks)",
  },
  {
    table: 'guide_messages',
    name: 'thread',
    columns: ['thread_id'],
    serves: 'one guide conversation',
  },
];
