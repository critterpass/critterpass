/**
 * A crew of eight on a trip in draft review: the organiser and m1–m4 hold seats (5 of 6), m5–m7
 * have none yet. One booked stay can be cancelled for free in ten days, and a Viator activity is
 * held for twenty minutes (never an input to reply-by).
 */
import { withSystem } from '@cp/db';
import type pg from 'pg';

import type { SignedIn } from '../../routes/command-doors-harness';

export interface ProposalFixture {
  readonly crewId: string;
  readonly tripId: string;
  readonly freeCancelUntil: Date;
}

export async function seedProposalTrip(
  pool: pg.Pool,
  organiser: SignedIn,
  members: readonly SignedIn[],
): Promise<ProposalFixture> {
  return withSystem(pool, async (tx) => {
    const one = async (sql: string, params: unknown[]) =>
      (await tx.query<{ id: string }>(sql, params)).rows[0]!.id;
    const names = [
      'Maya Tan',
      'Rin Sato',
      'Dev Rao',
      'Alex Kim',
      'Jordan Lee',
      'Sam Wu',
      'Ines Roa',
    ];
    await tx.query("UPDATE users SET display_name = 'Pat Organiser' WHERE id = $1", [
      organiser.uid,
    ]);
    for (const [index, member] of members.entries()) {
      await tx.query('UPDATE users SET display_name = $2 WHERE id = $1', [
        member.uid,
        names[index],
      ]);
    }
    const crewId = await one(
      "INSERT INTO crews (name, created_by) VALUES ('Kyoto Eight', $1) RETURNING id",
      [organiser.uid],
    );
    await tx.query(
      "INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, 'organiser')",
      [crewId, organiser.uid],
    );
    for (const member of members) {
      await tx.query(
        "INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, 'member')",
        [crewId, member.uid],
      );
    }
    const tripId = await one(
      "INSERT INTO trips (crew_id, status) VALUES ($1, 'voting') RETURNING id",
      [crewId],
    );
    for (const status of ['won', 'setup', 'drafting', 'draft_review']) {
      await tx.query('UPDATE trips SET status = $2 WHERE id = $1', [tripId, status]);
    }
    await tx.query(
      "UPDATE trips SET start_date = (now() + interval '60 days')::date WHERE id = $1",
      [tripId],
    );
    await tx.query(
      "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, 'organiser', 'in')",
      [tripId, organiser.uid],
    );
    for (const member of members.slice(0, 4)) {
      await tx.query('INSERT INTO trip_participants (trip_id, user_id) VALUES ($1, $2)', [
        tripId,
        member.uid,
      ]);
    }
    const freeCancelUntil = new Date(Date.now() + 10 * 86_400_000);
    await tx.query(
      `INSERT INTO bookings (trip_id, owner_id, type, title, visibility, free_cancel_until)
       VALUES ($1, $2, 'stay', 'Machiya', 'crew', $3)`,
      [tripId, organiser.uid, freeCancelUntil],
    );
    const order = await one(
      `INSERT INTO supplier_orders (trip_id, buyer_id, supplier, partner_cart_ref)
       VALUES ($1, $2, 'viator', 'cart-proposal-fixture') RETURNING id`,
      [tripId, organiser.uid],
    );
    await tx.query(
      `UPDATE supplier_orders SET status = 'holding', availability_status = 'HOLDING',
              hold_valid_until = now() + interval '20 minutes' WHERE id = $1`,
      [order],
    );
    return { crewId, tripId, freeCancelUntil };
  });
}
