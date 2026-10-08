/**
 * Home for a crew member who is not on the crew's locked-in trip, over the real local-first stack
 * with the api answered at the transport: with no seat they get the card and JOIN THE TRIP sends
 * `join_trip` for that trip; the card goes when their seat syncs; someone who said out gets it
 * too; someone on the trip, or on a trip not locked in yet, never does; someone waiting for a
 * seat reads their place instead.
 */
jest.mock('../fade-in-view', () => ({
  FadeInView: ({ children }: { children: unknown }) => children,
}));

import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import type { SyncTransport, TransportResponse } from '@/data/powersync/transport';
import { motionFreeze } from '@/motion/slowmo';

import { HomeScreen } from '../home-screen';
import { renderHome, seedCrew, seedTrip, TRIP, until } from '../test-support/home-harness';

const DAY = 86_400_000;
const day = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);

/** The command door, answered with a recorded response per command. */
function recordedApi(answers: Readonly<Record<string, TransportResponse>>) {
  const sent: { path: string; body: unknown }[] = [];
  const transport: SyncTransport = {
    postJson(path, body) {
      sent.push({ path, body });
      return Promise.resolve(answers[path.split('/').at(-1) ?? ''] ?? { status: 503, body: null });
    },
  };
  return { sent, transport };
}

const applied = (result: unknown): TransportResponse => ({
  status: 200,
  body: { status: 'applied', result },
});

let stack: TestLocalFirst | null = null;

async function open(transport?: SyncTransport): Promise<TestLocalFirst> {
  stack = await openTestLocalFirst({
    holdUploads: true,
    ...(transport === undefined ? {} : { transport }),
  });
  return stack;
}

/** The crew's trip to Bali at `status`, with the viewer's participant row as given (or none). */
async function seedTripWith(
  s: TestLocalFirst,
  status: string,
  mine: { rsvp: string; position?: number } | null,
): Promise<void> {
  await seedCrew(s);
  await seedTrip(s, { status, startDate: day(-1), endDate: day(3) });
  await s.db.execute('DELETE FROM trip_participants WHERE trip_id = ? AND user_id = ?', [
    TRIP,
    s.uid,
  ]);
  if (mine !== null) {
    await s.db.execute(
      `INSERT INTO trip_participants (id, trip_id, user_id, rsvp, waitlist_position)
       VALUES (?, ?, ?, ?, ?)`,
      [`tp-${s.uid}`, TRIP, s.uid, mine.rsvp, mine.position ?? null],
    );
  }
}

beforeAll(() => {
  motionFreeze.value = true;
});

afterAll(() => {
  motionFreeze.value = false;
});

afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

describe('a crew member who is not on the trip', () => {
  it('joins the trip under way from Home, and the card goes when the seat syncs', async () => {
    const api = recordedApi({
      join_trip: applied({
        trip_id: TRIP,
        seated: true,
        waitlisted: false,
        waitlist_position: null,
      }),
    });
    const s = await open(api.transport);
    await seedTripWith(s, 'in_trip', null);
    await renderHome(<HomeScreen />, s);
    await until(() => screen.queryByTestId('home-join-trip') !== null);
    // The card's headline face sets its line in capitals.
    expect(screen.getByText(/^the bali six is in bali right now\.$/i)).toBeTruthy();

    await fireEvent.press(screen.getByTestId('home-join-trip-cta'));
    await waitFor(() => expect(api.sent).toHaveLength(1));
    expect(api.sent[0]?.path).toBe('/v1/cmd/join_trip');
    expect((api.sent[0]?.body as { payload: unknown }).payload).toEqual({ trip_id: TRIP });

    // The server's row arrives with the next sync.
    await s.db.execute(
      "INSERT INTO trip_participants (id, trip_id, user_id, rsvp) VALUES (?, ?, ?, 'in')",
      [`tp-${s.uid}`, TRIP, s.uid],
    );
    await until(() => screen.queryByTestId('home-join-trip') === null);
    expect(screen.getByTestId('home-in-trip')).toBeTruthy();
  });

  it('offers a confirmed trip to someone who said out', async () => {
    const s = await open();
    await seedTripWith(s, 'confirmed', { rsvp: 'out' });
    await renderHome(<HomeScreen />, s);
    await until(() => screen.queryByTestId('home-join-trip') !== null);
    expect(screen.getByText(/^the bali six is going to bali\.$/i)).toBeTruthy();
  });

  it('shows their place in line instead once they wait for a seat', async () => {
    const s = await open();
    await seedTripWith(s, 'in_trip', { rsvp: 'waitlisted', position: 2 });
    await renderHome(<HomeScreen />, s);
    await until(() => screen.queryByTestId(`waitlist-${TRIP}`) !== null);
    expect(screen.getByText('You’re number 2 for a seat on Bali')).toBeTruthy();
    expect(screen.queryByTestId('home-join-trip')).toBeNull();
  });
});

describe('everyone else', () => {
  it('shows no card to someone on the trip', async () => {
    const s = await open();
    await seedTripWith(s, 'in_trip', { rsvp: 'in' });
    await renderHome(<HomeScreen />, s);
    await until(() => screen.queryByTestId('home-in-trip') !== null);
    expect(screen.queryByTestId('home-join-trip')).toBeNull();
  });

  it('shows no card while the trip is still proposed', async () => {
    const s = await open();
    await seedTripWith(s, 'proposed', null);
    await renderHome(<HomeScreen />, s);
    await until(() => screen.queryByTestId('home-mode-everyday') !== null);
    expect(screen.queryByTestId('home-join-trip')).toBeNull();
  });
});
