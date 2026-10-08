/**
 * Who a trip's plan goes to, read on the device over the real Node database. A solo trip lives in
 * the traveller's crew without being the crew's trip: its people are those with a seat on it, so
 * the traveller is never asked who is in and the next step is to finish the draft, not to send
 * it. A crew trip counts the whole active crew, and a crewmate who takes a seat on a solo trip
 * makes it a trip to send.
 */

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react-native';

import { OWNER_UID_KEY } from '@/data/powersync/local-tables';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import { tripTurn, type TripTurn } from '../../turn/model';
import { useProposalTrip, type ProposalTrip } from '../trip';

jest.setTimeout(60_000);

const CREW = '0199a6f0-0000-7000-8000-00000000c101';
const TRIP = '0199a6f0-0000-7000-8000-00000000e101';
const LINH = '0199a6f0-0000-7000-8000-00000000a101';
const MINH = '0199a6f0-0000-7000-8000-00000000a102';

let stack: TestLocalFirst | null = null;

afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

/** A crew of three whose trip is in draft review, with only the traveller seated on it. */
async function seed(s: TestLocalFirst, solo: boolean): Promise<void> {
  const { db, uid } = s;
  await db.execute('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
    OWNER_UID_KEY,
    uid,
  ]);
  await db.execute('INSERT INTO crews (id, name) VALUES (?, ?)', [CREW, 'Hanoi crew']);
  await db.execute(
    `INSERT INTO trips (id, crew_id, status, setup_step, is_solo, seat_cap)
     VALUES (?, ?, 'draft_review', 'done', ?, ?)`,
    [TRIP, CREW, solo ? 1 : 0, solo ? 1 : 6],
  );
  for (const [index, id] of [uid, LINH, MINH].entries()) {
    await db.execute('INSERT INTO users (id, display_name) VALUES (?, ?)', [id, `P${index}`]);
    await db.execute(
      `INSERT INTO crew_members (id, crew_id, user_id, status, created_at)
       VALUES (?, ?, ?, 'active', ?)`,
      [`cm-${index}`, CREW, id, `2026-09-0${index + 1}T00:00:00Z`],
    );
  }
  await db.execute(
    `INSERT INTO trip_participants (id, trip_id, user_id, role, rsvp)
     VALUES ('tp-me', ?, ?, 'organiser', 'in')`,
    [TRIP, uid],
  );
}

async function read(s: TestLocalFirst): Promise<{ trip: ProposalTrip; turn: TripTurn }> {
  const { result } = await renderHook(() => useProposalTrip(TRIP), { wrapper: s.wrapper });
  await waitFor(() => expect(result.current).toBeTruthy());
  const trip = result.current as ProposalTrip;
  const turn = tripTurn({
    status: trip.status,
    role: trip.isOrganiser ? 'organiser' : 'member',
    crewSize: trip.people.length,
    proposal: null,
    myRsvp: 'in',
    recipients: trip.people.filter((person) => person.uid !== trip.me),
  });
  return { trip, turn };
}

describe('who a plan goes to', () => {
  it('is nobody on a solo trip in a crew with friends: the traveller finishes the draft', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    await seed(stack, true);
    const { trip, turn } = await read(stack);
    expect(trip.isSolo).toBe(true);
    expect(trip.people.map((person) => person.uid)).toEqual([stack.uid]);
    expect(trip.recipients).toEqual([]);
    expect(turn.turn).toEqual({ kind: 'finish_draft' });
  });

  it('is the rest of the crew on a crew trip: the organiser sends the plan', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    await seed(stack, false);
    const { trip, turn } = await read(stack);
    expect(trip.isSolo).toBe(false);
    expect(trip.recipients.map((person) => person.uid)).toEqual([LINH, MINH]);
    expect(turn.turn).toEqual({ kind: 'send_plan', waiting: 2 });
  });

  it('is the crewmate who took a seat on a solo trip', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    await seed(stack, true);
    await stack.db.execute(
      `INSERT INTO trip_participants (id, trip_id, user_id, role, rsvp)
       VALUES ('tp-linh', ?, ?, 'member', 'unopened')`,
      [TRIP, LINH],
    );
    const { trip, turn } = await read(stack);
    expect(trip.recipients.map((person) => person.uid)).toEqual([LINH]);
    expect(turn.turn).toEqual({ kind: 'send_plan', waiting: 1 });
  });
});
