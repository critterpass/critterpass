/**
 * Wallet rows for the shared permission fixture: the organiser's crew stay (with a voucher and a
 * sealed QR), the organiser's personal flight whose crew visibility they switched off (its
 * boarding pass, its segment and a status watch), and the member's personal flight they left
 * visible; a quarantined forward to the crew address, a pending sender link, three import
 * candidates (the organiser's own paste, a forward shown to the crew, and a mailbox find of the
 * member's shown to the crew without consent), the organiser's Gmail connection and policy.
 */
import type pg from 'pg';

export interface BookingsFixtureInput {
  readonly crewId: string;
  readonly tripId: string;
  readonly organiser: string;
  readonly member: string;
}

/** Sentinel values suites look rows up by. */
export const FIXTURE_STAY_TITLE = 'Matrix probe villa';
export const FIXTURE_HIDDEN_FLIGHT = '938';
export const FIXTURE_SHARED_FLIGHT = '211';
const HASH = (digit: string) => digit.repeat(64);

async function booking(tx: pg.PoolClient, row: Readonly<Record<string, unknown>>): Promise<string> {
  const columns = Object.keys(row);
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO bookings (${columns.join(', ')})
     VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
    Object.values(row),
  );
  return rows[0]!.id;
}

export async function seedBookingRows(
  tx: pg.PoolClient,
  input: BookingsFixtureInput,
): Promise<void> {
  const { crewId, tripId, organiser, member } = input;
  const stay = await booking(tx, {
    trip_id: tripId,
    owner_id: organiser,
    type: 'stay',
    title: FIXTURE_STAY_TITLE,
    starts_at: '2026-10-12T07:00:00Z',
    ends_at: '2026-10-19T03:00:00Z',
    tz: 'Asia/Makassar',
    traveller_ids: [organiser, member],
    source: 'forward',
    supplier: 'agoda',
    supplier_ref: 'MATRIX1',
    free_cancel_until: '2026-10-05T16:00:00Z',
    cancel_policy_text: 'Free cancellation before 5 October 2026.',
    visibility: 'crew',
    barcode_payload_enc: 'v1:matrix-probe',
    barcode_format: 'qr',
  });
  await tx.query(
    `INSERT INTO booking_attachments (booking_id, trip_id, owner_id, crew_visible, media_key, kind)
     VALUES ($1, $2, $3, true, 'u/matrix/booking_doc/stay', 'voucher')`,
    [stay, tripId, organiser],
  );
  const hidden = await booking(tx, {
    trip_id: tripId,
    owner_id: organiser,
    type: 'flight',
    title: `SQ ${FIXTURE_HIDDEN_FLIGHT}`,
    starts_at: '2026-10-12T01:40:00Z',
    traveller_ids: [organiser],
    supplier: 'airline',
    visibility: 'personal',
    flight_crew_visible: false,
    barcode_payload_enc: 'v1:matrix-probe',
    barcode_format: 'pdf417',
  });
  await tx.query(
    `INSERT INTO booking_attachments (booking_id, trip_id, owner_id, crew_visible, media_key, kind)
     VALUES ($1, $2, $3, false, 'u/matrix/booking_doc/pass', 'boarding_pass')`,
    [hidden, tripId, organiser],
  );
  const { rows: segment } = await tx.query<{ id: string }>(
    `INSERT INTO flight_segments (booking_id, trip_id, owner_id, crew_visible, carrier, flight_no,
       dep_airport, arr_airport, sched_dep_at, sched_arr_at)
     VALUES ($1, $2, $3, false, 'SQ', $4, 'SIN', 'DPS', '2026-10-12T01:40:00Z',
       '2026-10-12T04:10:00Z') RETURNING id`,
    [hidden, tripId, organiser, FIXTURE_HIDDEN_FLIGHT],
  );
  await tx.query(
    `INSERT INTO flight_watches (flight_segment_id, provider, provider_alert_id, active_until)
     VALUES ($1, 'flightaware', 'matrix-alert', '2026-10-13T04:10:00Z')`,
    [segment[0]!.id],
  );
  const shared = await booking(tx, {
    trip_id: tripId,
    owner_id: member,
    type: 'flight',
    title: `SQ ${FIXTURE_SHARED_FLIGHT}`,
    starts_at: '2026-10-12T02:00:00Z',
    traveller_ids: [member],
    supplier: 'airline',
    visibility: 'personal',
  });
  await tx.query(
    `INSERT INTO flight_segments (booking_id, trip_id, owner_id, crew_visible, carrier, flight_no,
       dep_airport, arr_airport, sched_dep_at)
     VALUES ($1, $2, $3, true, 'SQ', $4, 'SIN', 'DPS', '2026-10-12T02:00:00Z')`,
    [shared, tripId, member, FIXTURE_SHARED_FLIGHT],
  );

  const { rows: address } = await tx.query<{ id: string }>(
    "SELECT id FROM crew_inbound_addresses WHERE crew_id = $1 AND status = 'active'",
    [crewId],
  );
  const { rows: mail } = await tx.query<{ id: string }>(
    `INSERT INTO inbound_emails (address_id, crew_id, sender_hash, message_id_hash, r2_key,
       size_bytes, dkim, spf, status, quarantine_reason)
     VALUES ($1, $2, $3, $4, 'inbound/matrix.eml', 2048, 'pass', 'pass', 'quarantined',
       'unknown_sender') RETURNING id`,
    [address[0]!.id, crewId, HASH('a'), HASH('b')],
  );
  await tx.query(
    `INSERT INTO inbound_sender_links (crew_id, sender_hash, code_hash, code_expires_at)
     VALUES ($1, $2, $3, now() + interval '1 day')`,
    [crewId, HASH('a'), HASH('c')],
  );
  await tx.query(
    `INSERT INTO import_candidates (user_id, trip_id, source, extracted, dedupe_key, status)
     VALUES ($1, $2, 'paste', '{"title":"Own paste"}', $3, 'pending')`,
    [organiser, tripId, `user:${organiser}:matrix-paste`],
  );
  await tx.query(
    `INSERT INTO import_candidates (user_id, crew_id, trip_id, source, extracted, dedupe_key,
       status, crew_visible, inbound_email_id)
     VALUES ($1, $2, $3, 'forward', '{"title":"Crew forward"}', $4, 'pending', true, $5)`,
    [organiser, crewId, tripId, `crew:${crewId}:matrix-forward`, mail[0]!.id],
  );
  await tx.query(
    `INSERT INTO import_candidates (user_id, crew_id, trip_id, source, extracted, dedupe_key,
       status, crew_visible)
     VALUES ($1, $2, $3, 'mailbox', '{"title":"Mailbox find"}', $4, 'pending', true)`,
    [member, crewId, tripId, `user:${member}:matrix-mailbox`],
  );
  await tx.query(
    `INSERT INTO mailbox_connections (user_id, provider, scopes, refresh_token_enc, last_history_id)
     VALUES ($1, 'gmail', 'https://www.googleapis.com/auth/gmail.readonly', 'v1:matrix-probe', '42')`,
    [organiser],
  );
  await tx.query(
    `INSERT INTO insurance_policies (user_id, trip_id, provider, policy_no_enc, assistance_phone_enc)
     VALUES ($1, $2, 'Chubb Travel', 'v1:matrix-probe', 'v1:matrix-probe')`,
    [organiser, tripId],
  );
}
