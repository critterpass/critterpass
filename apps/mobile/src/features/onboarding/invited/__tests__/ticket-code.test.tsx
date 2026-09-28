/**
 * 3a-10 and 3a-11 against recorded link previews: the named seat and the forwarded one, a full trip
 * offering the waitlist, every state that replaces the ticket, taking the seat straight into the
 * crew for someone with a pass, and the code boxes finding a crew or saying the code is wrong.
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
jest.mock('expo-clipboard', () => ({
  isPasteButtonAvailable: false,
  ClipboardPasteButton: () => null,
}));

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { setOnboardingComplete } from '@/lib/links/pending';

import { CodeScreen } from '../CodeScreen';
import { inviteSession } from '../invite-session';
import { TicketScreen } from '../TicketScreen';
import {
  applied,
  CREW_ID,
  preview,
  recordedApi,
  rejected,
  renderInvited,
  services,
  TRIP_ID,
} from '../test-support/fast-path';

const activate = (element: Parameters<typeof fireEvent>[0]) =>
  fireEvent(element, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
const found = (overrides = {}) => ({ status: 'found' as const, preview: preview(overrides) });

let stack: TestLocalFirst | null = null;

beforeEach(() => {
  inviteSession.reset();
  setOnboardingComplete(false);
  jest.mocked(router.push).mockClear();
  jest.mocked(router.replace).mockClear();
  jest.mocked(useLocalSearchParams).mockReturnValue({ code: 'BATH6X', seat: 'seat-token' });
});
afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

describe('3a-10 invite ticket', () => {
  it('names the invitee on their open seat and sends a first-timer to the pass', async () => {
    await renderInvited(<TicketScreen />, {
      services: services(found({ invitee_first_name: 'Rin' })),
    });
    expect(await screen.findByText('RIN, YOU’RE COMING TO BALI')).toBeTruthy();
    expect(screen.getByText('Winston saved you a seat')).toBeTruthy();
    expect(screen.getByText('Winston and Maya are in. 1 more invited, not in yet.')).toBeTruthy();
    expect(screen.getByTestId('invite-ticket')).toBeTruthy();
    await activate(screen.getByTestId('invite-take-seat'));
    expect(router.push).toHaveBeenCalledWith('/onboarding/invite/pass');
    expect(inviteSession.read().code).toBe('BATH6X');
  });

  it('never names anyone on a forwarded or generic link', async () => {
    await renderInvited(<TicketScreen />, { services: services(found()) });
    expect(await screen.findByText('A SEAT IN THE BALI SIX')).toBeTruthy();
    expect(screen.queryByText(/RIN/u)).toBeNull();
  });

  it('offers the waitlist truthfully on a full trip', async () => {
    await renderInvited(<TicketScreen />, { services: services(found({ seats_taken: 6 })) });
    expect(
      await screen.findByText(
        'The Bali Six is full at 6. You join the waitlist and get the next free seat.',
      ),
    ).toBeTruthy();
    expect(
      within(screen.getByTestId('invite-take-seat')).getByText(/join the waitlist/iu),
    ).toBeTruthy();
  });

  it.each([
    ['expired', found({ state: 'expired' }), 'This invite ran out'],
    ['revoked', found({ state: 'revoked' }), 'This invite was taken back'],
    ['used_up', found({ state: 'full' }), 'This code is used up'],
    ['referral', found({ kind: 'referral' }), 'Winston sent you'],
    ['not_found', { status: 'not_found' as const }, 'Can’t find that invite'],
    ['offline', { status: 'unavailable' as const }, 'You’re offline'],
  ])('shows the %s state in place of the ticket', async (kind, answer, title) => {
    await renderInvited(<TicketScreen />, { services: services(answer) });
    expect(await screen.findByTestId(`invite-problem-${kind}`)).toBeTruthy();
    expect(screen.getByText(new RegExp(title, 'iu'))).toBeTruthy();
    expect(screen.queryByTestId('invite-take-seat')).toBeNull();
  });

  it('asks again from the offline state', async () => {
    let online = false;
    const svc = services(() => (online ? found() : { status: 'unavailable' }));
    await renderInvited(<TicketScreen />, { services: svc });
    await screen.findByTestId('invite-problem-offline');
    online = true;
    await activate(screen.getByRole('button', { name: /try again/iu }));
    expect(await screen.findByText('A SEAT IN THE BALI SIX')).toBeTruthy();
  });

  it('shows a skeleton while the preview loads', async () => {
    await renderInvited(<TicketScreen />, {
      services: { ...services(found()), preview: () => new Promise(() => undefined) },
    });
    expect(screen.getByTestId('invite-ticket-loading')).toBeTruthy();
  });

  it('seats someone who already has a pass straight into the crew', async () => {
    setOnboardingComplete(true);
    const api = recordedApi({
      accept_invite: applied({
        crew_id: CREW_ID,
        trip_id: TRIP_ID,
        invite_id: null,
        joined: true,
        seated: true,
        waitlisted: false,
        waitlist_position: null,
        forwarded: false,
      }),
    });
    stack = await openTestLocalFirst({ transport: api });
    await renderInvited(<TicketScreen />, { services: services(found()), stack });
    await activate(await screen.findByTestId('invite-take-seat'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/onboarding/invite/manifest'));
    expect(api.sent[0]?.path).toBe('/v1/cmd/accept_invite');
    expect(inviteSession.read().joined?.crew_id).toBe(CREW_ID);
  });

  it('turns a refused join into its state, never a toast', async () => {
    setOnboardingComplete(true);
    stack = await openTestLocalFirst({
      transport: recordedApi({
        accept_invite: rejected('STATE_INVALID', 409, { reason: 'crew_full' }),
      }),
    });
    await renderInvited(<TicketScreen />, { services: services(found()), stack });
    await activate(await screen.findByTestId('invite-take-seat'));
    expect(await screen.findByTestId('invite-problem-crew_full')).toBeTruthy();
  });
});

describe('3a-11 join with a code', () => {
  beforeEach(() => {
    jest.mocked(useLocalSearchParams).mockReturnValue({});
  });

  it('finds the crew on the sixth character and joins it', async () => {
    const svc = services((target) =>
      target.kind === 'invite' && target.code === 'BATH6X' ? found() : { status: 'not_found' },
    );
    await renderInvited(<CodeScreen />, { services: svc });
    await fireEvent.changeText(screen.getByTestId('invite-code-boxes'), 'bath6x');
    expect(await screen.findByTestId('invite-found-card')).toBeTruthy();
    expect(screen.getByText('FOUND IT · WINSTON’S CREW')).toBeTruthy();
    expect(screen.getByText('2 already in. Tokek is guiding.')).toBeTruthy();
    await activate(screen.getByTestId('invite-code-join'));
    expect(router.push).toHaveBeenCalledWith('/onboarding/invite/pass');
  });

  it('says a wrong code is wrong', async () => {
    await renderInvited(<CodeScreen />, { services: services({ status: 'not_found' }) });
    await fireEvent.changeText(screen.getByTestId('invite-code-boxes'), 'ZZZZ22');
    expect(await screen.findByTestId('invite-code-wrong')).toBeTruthy();
    expect(screen.queryByTestId('invite-found-card')).toBeNull();
  });

  it('names the inviter when their code expired', async () => {
    await renderInvited(<CodeScreen />, { services: services(found({ state: 'expired' })) });
    await fireEvent.changeText(screen.getByTestId('invite-code-boxes'), 'BATH6X');
    expect(
      await screen.findByText('Ask Winston for a fresh link. It takes them two taps.'),
    ).toBeTruthy();
  });

  it('opens a pasted personal link on its own ticket', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({
      pasted: 'https://critterpass.app/i/BATH6X/abcdefghijklmnopqrstuvabcdefghijklmnopqrstuvk1',
    });
    await renderInvited(<CodeScreen />, { services: services(found()) });
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        pathname: '/onboarding/invite/ticket',
        params: { code: 'BATH6X', seat: 'abcdefghijklmnopqrstuvabcdefghijklmnopqrstuvk1' },
      }),
    );
  });
});
