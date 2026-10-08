/**
 * Who holds a seat on a trip, for the phone's own queries: the server's rule, read from `rsvp`.
 * Someone who is `out` or `waitlisted` holds none; `unopened`, `opened`, `maybe` and `in` do. The
 * server also stores the answer in a generated column, which replication does not publish, so that
 * column is empty on the device and no local query may read it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */

/**
 * A SQL condition that is true for a `trip_participants` row holding a seat. `alias` is the
 * table's alias in the query; on the empty side of a LEFT JOIN the condition is NULL, never true.
 */
export function seatHeldSql(alias?: string): string {
  const rsvp = alias === undefined ? 'rsvp' : `${alias}.rsvp`;
  return `${rsvp} NOT IN ('out', 'waitlisted')`;
}
