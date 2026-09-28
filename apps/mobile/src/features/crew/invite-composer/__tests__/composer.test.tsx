/**
 * The invite composer, the seat-limit presenter contract and the waitlist cards over the real
 * local-first stack, with the api answered by recorded responses at the transport and the native
 * share, clipboard and messaging boundaries recorded: only what the inviter typed goes over the
 * wire, a full trip reaches whichever presenter is registered (never a toast), the default one
 * waitlists the invitee, and a seat offer is taken only when its holder taps it.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('@/ui/sticker/Sticker', () => require('@/ui/avatar/test-support/sticker-double'));
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import { CrewsSheet } from '../../crews-sheet/CrewsSheet';
import {
  applied,
  recordedApi,
  recordingServices,
  rejected,
  renderWithCrew,
} from '../../crews-sheet/test-support/crew-harness';
import {
  registerSeatLimitPresenter,
  type SeatLimitPresenterProps,
} from '../../seat-limit/registry';
import { InviteComposerScreen } from '../InviteComposerScreen';

const ME = '0192e1a2-0000-7000-8000-0000000000aa';
const CREW = '0192e1a2-0000-7000-8000-00000000c001';
const TRIP = '0192e1a2-0000-7000-8000-000000007001';
const OFFER = '0192e1a2-0000-7000-8000-00000000f001';
const SENT = {
  invite_id: 'i',
  code: 'K7M2QX',
  link: '/i/K7M2QX',
  url: 'https://critterpass.app/i/K7M2QX/seat',
  expires_at: '2026-10-12T00:00:00Z',
  waitlisted: false,
};
const FULL = rejected('SEAT_LIMIT', 402, {
  cap: 6,
  offer: 'boost',
  trip_id: TRIP,
  invitee: 'Kai',
  seats_taken: 6,
});

const activate = (element: Parameters<typeof fireEvent>[0]) =>
  fireEvent(element, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });

let stack: TestLocalFirst | null = null;
const services = recordingServices(ME);

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
}

async function fillFriend() {
  await fireEvent.changeText(await screen.findByTestId('composer-name'), 'Kai');
  await fireEvent.changeText(screen.getByTestId('composer-phone'), '+65 9123 4567');
  await fireEvent.changeText(screen.getByTestId('composer-note'), 'loves night markets');
  await activate(screen.getByTestId('composer-tag-markets'));
  await activate(screen.getByTestId(`composer-trip-${TRIP}`));
}

beforeEach(() => {
  services.shared.length = 0;
  services.copied.length = 0;
  services.opened.length = 0;
  services.suggested.length = 0;
  services.suggestion = null;
  jest.mocked(useLocalSearchParams).mockReturnValue({ crewId: CREW });
});
afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

describe('invite composer', () => {
  it('sends only what the inviter typed, then opens WhatsApp with the link', async () => {
    const api = recordedApi({ create_invite: applied(SENT) });
    stack = await openTestLocalFirst({ transport: api, uid: ME, holdUploads: true });
    await seed(stack.db);
    await renderWithCrew(<InviteComposerScreen />, stack, services);
    await fillFriend();
    await activate(screen.getByTestId('composer-send-wa'));
    await waitFor(() => expect(services.opened).toHaveLength(1));
    expect(services.opened[0]).toContain(encodeURIComponent(SENT.url));
    const body = api.sent[0]?.body as { payload: Record<string, unknown> };
    expect(api.sent).toHaveLength(1);
    expect(body.payload).toEqual({
      crew_id: CREW,
      trip_id: TRIP,
      share_via: 'wa',
      channel: 'contact',
      contact: { name: 'Kai', provenance: 'typed', phone_e164: '+6591234567', home_hint: 'SIN' },
      note: 'loves night markets',
      tags: ['markets'],
    });
  });

  it('copies a generic link without naming anyone', async () => {
    const api = recordedApi({
      create_invite: applied({ ...SENT, url: 'https://critterpass.app/i/K7M2QX' }),
    });
    stack = await openTestLocalFirst({ transport: api, uid: ME, holdUploads: true });
    await seed(stack.db);
    await renderWithCrew(<InviteComposerScreen />, stack, services);
    await screen.findByText(/^invite to the bali six$/iu);
    await fireEvent.press(screen.getByRole('radio', { name: /a link to share/iu }));
    await activate(screen.getByTestId('composer-send-copy'));
    await waitFor(() => expect(services.copied).toEqual(['https://critterpass.app/i/K7M2QX']));
    expect((api.sent[0]?.body as { payload: Record<string, unknown> }).payload).toEqual({
      crew_id: CREW,
      share_via: 'copy',
      channel: 'link',
    });
  });

  it('hands a full trip to the registered presenter, never a toast', async () => {
    const seen: SeatLimitPresenterProps[] = [];
    const stop = registerSeatLimitPresenter((props) => {
      seen.push(props);
      return <Text testID="test-presenter">{props.tripName}</Text>;
    });
    stack = await openTestLocalFirst({
      transport: recordedApi({ create_invite: FULL }),
      uid: ME,
      holdUploads: true,
    });
    await seed(stack.db);
    await renderWithCrew(<InviteComposerScreen />, stack, services);
    await fillFriend();
    await activate(screen.getByTestId('composer-send-wa'));
    expect(await screen.findByTestId('test-presenter')).toHaveTextContent('Bali');
    expect(seen.at(-1)?.detail).toEqual({
      cap: 6,
      offer: 'boost',
      trip_id: TRIP,
      invitee: 'Kai',
      seats_taken: 6,
    });
    expect(services.opened).toEqual([]);
    stop();
  });

  it('waitlists the invitee through the default presenter', async () => {
    let calls = 0;
    const api = recordedApi({});
    api.postJson = (path, body) => {
      api.sent.push({ path, body });
      calls += 1;
      return Promise.resolve(calls === 1 ? FULL : applied({ ...SENT, waitlisted: true }));
    };
    stack = await openTestLocalFirst({ transport: api, uid: ME, holdUploads: true });
    await seed(stack.db);
    await renderWithCrew(<InviteComposerScreen />, stack, services);
    await fillFriend();
    await activate(screen.getByTestId('composer-send-wa'));
    expect(
      await screen.findByText(
        'Bali is full at 6. Kai joins the waitlist and gets the next free seat.',
      ),
    ).toBeTruthy();
    await activate(screen.getByTestId('seat-limit-waitlist-confirm'));
    await waitFor(() => expect(services.opened).toHaveLength(1));
    expect((api.sent[1]?.body as { payload: { on_full?: string } }).payload.on_full).toBe(
      'waitlist',
    );
  });

  it('asks a signed-out inviter to save their pass', async () => {
    stack = await openTestLocalFirst({
      transport: recordedApi({ create_invite: rejected('AUTH_REQUIRED', 401) }),
      uid: ME,
      holdUploads: true,
    });
    await seed(stack.db);
    await renderWithCrew(<InviteComposerScreen />, stack, services);
    await fillFriend();
    await activate(screen.getByTestId('composer-send-wa'));
    expect(await screen.findByTestId('composer-sign-in')).toBeTruthy();
    expect(screen.getByTestId('composer-save')).toBeTruthy();
  });

  it("offers the guide's tags for the note and picks them only when the inviter says so", async () => {
    services.suggestion = {
      tags: ['markets', 'nightlife'],
      line: 'Kai sounds like a night market person.',
      guide: 'pon',
      source: 'model',
    };
    const api = recordedApi({ create_invite: applied(SENT) });
    stack = await openTestLocalFirst({ transport: api, uid: ME, holdUploads: true });
    await seed(stack.db);
    await renderWithCrew(<InviteComposerScreen />, stack, services);
    await fireEvent.changeText(await screen.findByTestId('composer-name'), 'Kai');
    await fireEvent.changeText(screen.getByTestId('composer-note'), 'loves night markets');
    expect(
      await screen.findByText('Kai sounds like a night market person.', {}, { timeout: 5000 }),
    ).toBeTruthy();
    expect(services.suggested).toEqual([
      { crew_id: CREW, note: 'loves night markets', invitee_name: 'Kai' },
    ]);
    expect(screen.getByTestId('composer-tag-markets')).not.toBeSelected();
    await activate(screen.getByTestId('composer-suggestion-use'));
    expect(screen.getByTestId('composer-tag-markets')).toBeSelected();
    expect(screen.getByTestId('composer-tag-nightlife')).toBeSelected();
    expect(api.sent).toEqual([]);
  });

  it('shows no suggestion when the api cannot answer', async () => {
    stack = await openTestLocalFirst({ transport: recordedApi({}), uid: ME, holdUploads: true });
    await seed(stack.db);
    await renderWithCrew(<InviteComposerScreen />, stack, services);
    await fireEvent.changeText(await screen.findByTestId('composer-name'), 'Kai');
    await fireEvent.changeText(screen.getByTestId('composer-note'), 'loves night markets');
    await waitFor(() => expect(services.suggested).toHaveLength(1), { timeout: 5000 });
    expect(screen.queryByTestId('composer-suggestion')).toBeNull();
  });

  it('labels taste chips with their words, never their slugs', async () => {
    stack = await openTestLocalFirst({ transport: recordedApi({}), uid: ME, holdUploads: true });
    await seed(stack.db);
    await renderWithCrew(<InviteComposerScreen />, stack, services);
    const chip = await screen.findByTestId('composer-tag-nightlife');
    expect(chip).toHaveTextContent('NIGHT OWL');
    expect(screen.getByTestId('composer-tag-sit_down_dining')).toHaveTextContent('PROPER DINNERS');
    expect(screen.queryByText(/_/u)).toBeNull();
  });
});

describe('waitlist on the crews sheet', () => {
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
    await renderWithCrew(<CrewsSheet />, stack, services);
    expect(await screen.findByText('You’re number 2 for a seat on Bali')).toBeTruthy();
    const expires = new Date(Date.now() + 20 * 3_600_000).toISOString();
    await stack.db.execute(
      "INSERT INTO seat_waitlist_offers (id, trip_id, user_id, status, expires_at) VALUES (?, ?, ?, 'offered', ?)",
      [OFFER, TRIP, ME, expires],
    );
    expect(await screen.findByText(/^a seat opened on bali$/iu)).toBeTruthy();
    expect(api.sent).toEqual([]);
    await activate(screen.getByTestId(`seat-offer-take-${OFFER}`));
    await waitFor(() => expect(api.sent.map((s) => s.path)).toEqual(['/v1/cmd/accept_seat_offer']));
  });
});
