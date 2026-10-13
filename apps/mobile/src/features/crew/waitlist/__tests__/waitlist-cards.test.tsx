/**
 * The caller's place on a full trip, over the real local-first stack with the api answered by a
 * recorded response at the transport: who is next, and a seat offer taken only when its holder
 * taps it.
 */
import { afterEach, describe, expect, it } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import {
  applied,
  recordedApi,
  recordingServices,
  renderWithCrew,
} from '../../crews-sheet/test-support/crew-harness';
import { WaitlistCards } from '../WaitlistCards';

const ME = '0192e1a2-0000-7000-8000-0000000000aa';
const CREW = '0192e1a2-0000-7000-8000-00000000c001';
const TRIP = '0192e1a2-0000-7000-8000-000000007001';
const OFFER = '0192e1a2-0000-7000-8000-00000000f001';

let stack: TestLocalFirst | null = null;

afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

async function seed(db: TestLocalFirst['db']) {
  await db.execute('INSERT INTO users (id, display_name) VALUES (?, ?)', [ME, 'Winston']);
  await db.execute("INSERT INTO crews (id, name, created_by) VALUES (?, 'The Bali Six', ?)", [
    CREW,
    ME,
  ]);
  await db.execute(
    "INSERT INTO crew_members (id, crew_id, user_id, role, status, created_at) VALUES ('cm', ?, ?, 'organiser', 'active', '2026-09-01')",
    [CREW, ME],
  );
  await db.execute("INSERT INTO destinations (id, slug, name) VALUES ('d', 'bali', 'Bali')");
  await db.execute(
    "INSERT INTO trips (id, crew_id, status, destination_id) VALUES (?, ?, 'setup', 'd')",
    [TRIP, CREW],
  );
  await db.execute(
    "INSERT INTO join_codes (id, crew_id, code, status, target_kind, created_at) VALUES ('jc', ?, 'BALI66', 'active', 'crew', '2026-09-01')",
    [CREW],
  );
}

describe('waitlist cards', () => {
  it('says who is next, and takes an offered seat only when tapped', async () => {
    const api = recordedApi({
      accept_seat_offer: applied({ trip_id: TRIP, offer_id: OFFER, seated: true }),
    });
    stack = await openTestLocalFirst({ transport: api, uid: ME, holdUploads: true });
    await seed(stack.db);
    await stack.db.execute(
      "INSERT INTO trip_participants (id, trip_id, user_id, rsvp, waitlist_position) VALUES ('tp', ?, ?, 'waitlisted', 2)",
      [TRIP, ME],
    );
    await renderWithCrew(
      <WaitlistCards
        db={stack.db}
        uid={ME}
        commands={stack.value.commands}
        now={new Date()}
        crewId={CREW}
      />,
      stack,
      recordingServices(ME),
    );
    expect(await screen.findByText('You’re number 2 for a seat on Bali')).toBeTruthy();
    const expires = new Date(Date.now() + 20 * 3_600_000).toISOString();
    await stack.db.execute(
      "INSERT INTO seat_waitlist_offers (id, trip_id, user_id, status, expires_at) VALUES (?, ?, ?, 'offered', ?)",
      [OFFER, TRIP, ME, expires],
    );
    expect(await screen.findByText(/^a seat opened on bali$/iu)).toBeTruthy();
    expect(api.sent).toEqual([]);
    await fireEvent.press(screen.getByTestId(`seat-offer-take-${OFFER}`));
    await waitFor(() => expect(api.sent.map((s) => s.path)).toEqual(['/v1/cmd/accept_seat_offer']));
  });
});
