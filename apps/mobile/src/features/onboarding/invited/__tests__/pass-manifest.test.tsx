/**
 * 3a-12 and 3a-13 over the real local-first stack, with the api answered by recorded responses at
 * the transport: the inviter's prefill on the pass (provenance, home, chips), issuing into the save
 * sheet and taking the seat after "Not now" or a number verified on the phone page, a join refused
 * as a state, and the manifest built from
 * synced crew rows with the newcomer ringed, unnamed waiting seats, the waitlist copy and the
 * link-open-to-manifest timing.
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
// A page is in front until another is pushed over it; `mockOver` is that page's count.
const mockOver = { pages: 0 };
jest.mock('expo-router', () => ({
  useIsFocused: () => mockOver.pages === 0,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { useState } from 'react';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { isOnboardingComplete, setOnboardingComplete } from '@/lib/links/pending';

import { clearDraftForTests, readDraft } from '../../flow-controller/draft-store';
import { PhoneScreen } from '../../phone/PhoneScreen';
import { inviteSession } from '../invite-session';
import { ManifestScreen } from '../ManifestScreen';
import { PassScreen } from '../PassScreen';
import {
  applied,
  CREW_ID,
  preview,
  recordedApi,
  rejected,
  renderInvited,
  services,
  TRIP_ID,
  UNREACHABLE,
} from '../test-support/fast-path';

const activate = (element: Parameters<typeof fireEvent>[0]) =>
  fireEvent(element, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });

const ME = '0192e1a2-0000-7000-8000-0000000000aa';
const JOINED = {
  crew_id: CREW_ID,
  trip_id: TRIP_ID,
  invite_id: null,
  joined: true,
  seated: true,
  waitlisted: false,
  waitlist_position: null,
  forwarded: false,
};

let stack: TestLocalFirst | null = null;

beforeEach(() => {
  clearDraftForTests();
  inviteSession.reset();
  setOnboardingComplete(false);
  mockOver.pages = 0;
  jest.mocked(router.push).mockReset();
  jest.mocked(router.replace).mockClear();
  jest.mocked(router.back).mockReset();
});
afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

function openInvite(overrides = {}) {
  inviteSession.open('BATH6X', 'seat-token', Date.parse('2026-09-28T09:59:50Z'));
  inviteSession.setPreview(
    preview({
      invitee_first_name: 'Rin',
      invitee_home_hint: 'SIN',
      invitee_tags: ['street_food', 'beach'],
      ...overrides,
    }),
  );
}

describe('3a-12 your pass, three taps', () => {
  it('pours the inviter’s prefill into the pass, marked as theirs', async () => {
    openInvite();
    stack = await openTestLocalFirst({ holdUploads: true });
    await renderInvited(<PassScreen />, { services: services({ status: 'not_found' }), stack });
    await waitFor(() => expect(readDraft()?.given_name).toBe('Rin'));
    expect(readDraft()?.home_iata).toBe('SIN');
    expect(readDraft()?.answers.length).toBeGreaterThan(0);
    expect(screen.getByText(/from winston’s contacts/iu)).toBeTruthy();
    expect(screen.getByTestId('invite-pass-chip-street_food')).toBeTruthy();
    expect(screen.getByText('Winston gave me a hint. I picked 2.')).toBeTruthy();
  });

  it('issues the pass, then takes the seat after “Not now”', async () => {
    openInvite();
    const api = recordedApi({ accept_invite: applied(JOINED) });
    stack = await openTestLocalFirst({ transport: api, holdUploads: true });
    const { analytics } = await renderInvited(<PassScreen />, {
      services: services({ status: 'not_found' }),
      stack,
    });
    await waitFor(() => expect(readDraft()?.home_iata).toBe('SIN'));
    await activate(screen.getByTestId('invite-pass-issue'));
    expect(readDraft()?.issued_at).not.toBeNull();
    await activate(await screen.findByTestId('save-not-now'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/onboarding/invite/manifest'));
    expect(isOnboardingComplete()).toBe(true);
    expect(api.sent.find((s) => s.path.endsWith('accept_invite'))).toBeTruthy();
    expect(analytics.events.map((e) => e.event)).toContain('invite_prefill_viewed');
  });

  /** The pass page with the phone page pushed over it and popped again, as the stack keeps them. */
  function PassUnderPhone() {
    const [phoneUp, setPhoneUp] = useState(false);
    jest.mocked(router.push).mockImplementation(() => {
      mockOver.pages = 1;
      setPhoneUp(true);
    });
    jest.mocked(router.back).mockImplementation(() => {
      mockOver.pages = 0;
      setPhoneUp(false);
    });
    return (
      <>
        <PassScreen />
        {phoneUp ? <PhoneScreen /> : null}
      </>
    );
  }

  it('takes the seat once, with the code and the seat, after saving with a phone number', async () => {
    openInvite();
    const api = recordedApi({ accept_invite: applied(JOINED) });
    stack = await openTestLocalFirst({ transport: api, holdUploads: true });
    await renderInvited(<PassUnderPhone />, {
      services: services({ status: 'not_found' }),
      stack,
    });
    await waitFor(() => expect(readDraft()?.home_iata).toBe('SIN'));
    await activate(screen.getByTestId('invite-pass-issue'));
    await activate(await screen.findByTestId('save-phone'));
    expect(router.push).toHaveBeenCalledWith('/onboarding/phone');

    await fireEvent.changeText(await screen.findByTestId('phone-number'), '91234567');
    await activate(screen.getByTestId('phone-send'));
    await fireEvent.changeText(await screen.findByLabelText('Verification code'), '419203');
    await waitFor(() => expect(readDraft()?.saved).toBe(true));
    // The number is verified on the page above: nothing is sent until the pass page is back.
    const joins = () => api.sent.filter((s) => s.path.endsWith('accept_invite'));
    expect(joins()).toHaveLength(0);

    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1), { timeout: 5000 });
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/onboarding/invite/manifest'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(joins()).toHaveLength(1);
    expect(joins()[0]?.body).toMatchObject({ payload: { code: 'BATH6X', seat: 'seat-token' } });
    expect(router.replace).not.toHaveBeenCalledWith('/onboarding/permissions');
    expect(isOnboardingComplete()).toBe(true);
  }, 15_000);

  it('shows a refused join as its state', async () => {
    openInvite();
    stack = await openTestLocalFirst({
      transport: recordedApi({ accept_invite: rejected('INVITE_EXPIRED', 410) }),
      holdUploads: true,
    });
    await renderInvited(<PassScreen />, { services: services({ status: 'not_found' }), stack });
    await waitFor(() => expect(readDraft()?.home_iata).toBe('SIN'));
    await activate(screen.getByTestId('invite-pass-issue'));
    await activate(await screen.findByTestId('save-not-now'));
    expect(await screen.findByTestId('invite-problem-expired')).toBeTruthy();
    // An invite that is over cannot be tried again: the pass is theirs, and Home is the way on.
    expect(screen.queryByRole('button', { name: /try again/iu })).toBeNull();
    await activate(screen.getByRole('button', { name: /go home/iu }));
    expect(router.replace).toHaveBeenCalledWith('/');
    expect(isOnboardingComplete()).toBe(true);
  });

  it('keeps the code and sends the join again in place when it could not reach the server', async () => {
    openInvite();
    const api = recordedApi({ accept_invite: [UNREACHABLE, applied(JOINED)] });
    stack = await openTestLocalFirst({ transport: api, holdUploads: true });
    await renderInvited(<PassScreen />, { services: services({ status: 'not_found' }), stack });
    await waitFor(() => expect(readDraft()?.home_iata).toBe('SIN'));
    await activate(screen.getByTestId('invite-pass-issue'));
    await activate(await screen.findByTestId('save-not-now'));
    expect(await screen.findByTestId('invite-problem-offline')).toBeTruthy();
    // Nothing is given up yet: the invite and the unfinished onboarding are as they were.
    expect(isOnboardingComplete()).toBe(false);
    expect(inviteSession.read().code).toBe('BATH6X');

    await activate(screen.getByRole('button', { name: /try again/iu }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/onboarding/invite/manifest'));
    const joins = api.sent.filter((sent) => sent.path.endsWith('accept_invite'));
    expect(joins).toHaveLength(2);
    expect(joins[1]?.body).toMatchObject({ payload: { code: 'BATH6X', seat: 'seat-token' } });
    expect(isOnboardingComplete()).toBe(true);
  });

  it('asks a code joiner for a name and a home, then lets them issue', async () => {
    inviteSession.open('BATH6X', null, 0);
    stack = await openTestLocalFirst({ holdUploads: true });
    await renderInvited(<PassScreen />, { services: services({ status: 'not_found' }), stack });
    // The sheet that asks is already open; nothing to issue yet, and the button says what is missing.
    expect(await screen.findByTestId('invite-edit-name')).toBeTruthy();
    expect(screen.queryByTestId('invite-pass-issue')).toBeNull();
    expect(within(screen.getByTestId('invite-pass-ask')).getByText('ADD YOUR NAME')).toBeTruthy();
    expect(screen.getByTestId('invite-edit-done')).toBeDisabled();

    await fireEvent.changeText(screen.getByTestId('invite-edit-name'), 'Mai');
    expect(
      within(screen.getByTestId('invite-edit-done')).getByText(/add your home airport/iu),
    ).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('invite-edit-home'), 'Sing');
    await fireEvent.press(await screen.findByTestId('invite-edit-home-SIN'));
    expect(
      within(screen.getByTestId('invite-edit-home-picked')).getByText('Singapore · SIN'),
    ).toBeTruthy();
    await activate(screen.getByTestId('invite-edit-done'));

    await waitFor(() => expect(readDraft()?.home_iata).toBe('SIN'));
    expect(readDraft()?.given_name).toBe('Mai');
    expect(screen.queryByTestId('invite-pass-ask')).toBeNull();
    expect(screen.getByTestId('invite-pass-issue')).toBeEnabled();
  });

  it('asks only for the home when the invite carried a name', async () => {
    openInvite({ invitee_home_hint: null });
    stack = await openTestLocalFirst({ holdUploads: true });
    await renderInvited(<PassScreen />, { services: services({ status: 'not_found' }), stack });
    await waitFor(() => expect(readDraft()?.given_name).toBe('Rin'));
    expect(
      within(await screen.findByTestId('invite-pass-ask')).getByText('ADD YOUR HOME AIRPORT'),
    ).toBeTruthy();
  });
});

describe('3a-13 you’re in', () => {
  async function seedCrew(db: TestLocalFirst['db']) {
    const members: [string, string, string][] = [
      ['0192e1a2-0000-7000-8000-0000000000w1', 'Winston Lee', 'organiser'],
      ['0192e1a2-0000-7000-8000-0000000000m1', 'Maya', 'member'],
      [ME, 'Rin', 'member'],
    ];
    for (const [index, [uid, name, role]] of members.entries()) {
      await db.execute('INSERT INTO users (id, display_name) VALUES (?, ?)', [uid, name]);
      await db.execute(
        "INSERT INTO crew_members (id, crew_id, user_id, role, status, created_at) VALUES (?, ?, ?, ?, 'active', ?)",
        [`cm-${index}`, CREW_ID, uid, role, `2026-09-2${index}T00:00:00Z`],
      );
    }
  }

  it("types out the guide's welcome from the api for this crew and trip", async () => {
    openInvite();
    inviteSession.setJoined(JOINED);
    stack = await openTestLocalFirst({ holdUploads: true, uid: ME });
    await seedCrew(stack.db);
    const answering = services({ status: 'not_found' }, ME, {
      line: 'Rin, the Bali Six just got louder.',
      source: 'model',
    });
    await renderInvited(<ManifestScreen />, { services: answering, stack });
    expect(
      await screen.findByText('Rin, the Bali Six just got louder.', {}, { timeout: 8000 }),
    ).toBeTruthy();
    expect(answering.welcomed).toEqual([{ crewId: CREW_ID, tripId: TRIP_ID }]);
  });

  it('keeps the scripted welcome when the api cannot answer', async () => {
    openInvite();
    inviteSession.setJoined(JOINED);
    stack = await openTestLocalFirst({ holdUploads: true, uid: ME });
    await seedCrew(stack.db);
    await renderInvited(<ManifestScreen />, {
      services: services({ status: 'not_found' }, ME),
      stack,
    });
    expect(
      await screen.findByText('Welcome, Rin. Glad you made it.', {}, { timeout: 8000 }),
    ).toBeTruthy();
  });

  it('tells a waitlisted joiner they are next, and shows no waiting seats', async () => {
    openInvite();
    inviteSession.setJoined({ ...JOINED, seated: false, waitlisted: true, waitlist_position: 1 });
    stack = await openTestLocalFirst({ holdUploads: true, uid: ME });
    await renderInvited(<ManifestScreen />, {
      services: services({ status: 'not_found' }, ME),
      stack,
    });
    expect(await screen.findByText(/rin’s next/iu)).toBeTruthy();
    expect(screen.getByText(/next for a seat/u)).toBeTruthy();
    expect(screen.queryByTestId('invite-manifest-pending-0')).toBeNull();
  });
});
