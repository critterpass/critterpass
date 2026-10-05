/**
 * "Pick from contacts" in the invite composer over the real local-first stack, with the native
 * contact picker faked at its module boundary (the OS sheet cannot run under Jest): a picked
 * person fills the name and number, the invite goes out marked as from the inviter's contacts with
 * only the fields the contract allows, the number is gone once it is sent, a cancel changes
 * nothing, and a binary without the picker hides the option.
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
jest.mock('../../../modules/cp-contact-picker/src/CpContactPickerModule', () => {
  const mockNative = { pick: jest.fn() };
  return {
    mockNative,
    mockLinked: { value: true },
    get nativeCpContactPickerModule() {
      return this.mockLinked.value ? mockNative : null;
    },
  };
});

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { toastQueue } from '@/motion/island-toast';

import * as pickerBinding from '../../../modules/cp-contact-picker/src/CpContactPickerModule';
import {
  applied,
  recordedApi,
  recordingServices,
  renderWithCrew,
} from '@/features/crew/crews-sheet/test-support/crew-harness';
import InviteRoute from '../crew/[crewId]/invite';

const { mockNative: native, mockLinked: linked } = pickerBinding as unknown as {
  readonly mockNative: { readonly pick: jest.Mock<() => Promise<unknown>> };
  readonly mockLinked: { value: boolean };
};

const ME = '0192e1a2-0000-7000-8000-0000000000aa';
const CREW = '0192e1a2-0000-7000-8000-00000000c001';
const SENT = {
  invite_id: 'i',
  code: 'K7M2QX',
  link: '/i/K7M2QX',
  url: 'https://critterpass.app/i/K7M2QX/seat',
  expires_at: '2026-10-12T00:00:00Z',
  waitlisted: false,
};

const activate = (element: Parameters<typeof fireEvent>[0]) =>
  fireEvent(element, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });

let stack: TestLocalFirst | null = null;
const services = recordingServices(ME);

async function open(api = recordedApi({ create_invite: applied(SENT) })) {
  stack = await openTestLocalFirst({ transport: api, uid: ME, holdUploads: true });
  await stack.db.execute('INSERT INTO users (id, display_name) VALUES (?, ?)', [ME, 'Winston']);
  await stack.db.execute("INSERT INTO crews (id, name, created_by) VALUES (?, 'The Bali Six', ?)", [
    CREW,
    ME,
  ]);
  await stack.db.execute(
    "INSERT INTO crew_members (id, crew_id, user_id, role, status, created_at) VALUES ('cm', ?, ?, 'organiser', 'active', '2026-09-01')",
    [CREW, ME],
  );
  await renderWithCrew(<InviteRoute />, stack, services);
  await screen.findByText(/^invite to the bali six$/iu);
  // The composer opens on the link and the crew code; a named seat is its second tab.
  await fireEvent.press(await screen.findByRole('radio', { name: /a friend/iu }));
  return api;
}

beforeEach(() => {
  linked.value = true;
  native.pick.mockReset();
  services.opened.length = 0;
  services.suggestion = null;
  jest.mocked(useLocalSearchParams).mockReturnValue({ crewId: CREW });
});
afterEach(async () => {
  toastQueue.resetForTests();
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

describe('picking the friend from contacts', () => {
  it('fills name and number, sends them as from contacts, then forgets the number', async () => {
    native.pick.mockResolvedValueOnce({ name: 'Kai', phone: '+65 9123 4567' });
    const api = await open();
    await activate(screen.getByTestId('composer-pick-contact'));
    await waitFor(() => expect(screen.getByTestId('composer-name')).toHaveDisplayValue('Kai'));
    expect(screen.getByTestId('composer-phone')).toHaveDisplayValue('+6591234567');
    expect(screen.getByText('Home guess from their number: SIN')).toBeTruthy();
    await activate(screen.getByTestId('composer-send-wa'));
    await waitFor(() => expect(services.opened).toHaveLength(1));
    expect(api.sent).toHaveLength(1);
    expect((api.sent[0]?.body as { payload: Record<string, unknown> }).payload).toEqual({
      crew_id: CREW,
      share_via: 'wa',
      channel: 'contact',
      contact: { name: 'Kai', provenance: 'contacts', phone_e164: '+6591234567', home_hint: 'SIN' },
    });
    expect(screen.getByTestId('composer-name')).toHaveDisplayValue('');
    expect(screen.getByTestId('composer-phone')).toHaveDisplayValue('');
  });

  it('keeps a contact without a number to a name alone', async () => {
    native.pick.mockResolvedValueOnce({ name: 'Mai' });
    const api = await open();
    await fireEvent.changeText(screen.getByTestId('composer-phone'), '+65 9123 4567');
    await activate(screen.getByTestId('composer-pick-contact'));
    await waitFor(() => expect(screen.getByTestId('composer-name')).toHaveDisplayValue('Mai'));
    expect(screen.getByTestId('composer-phone')).toHaveDisplayValue('');
    await activate(screen.getByTestId('composer-send-copy'));
    await waitFor(() => expect(api.sent).toHaveLength(1));
    expect(
      (api.sent[0]?.body as { payload: { contact: Record<string, unknown> } }).payload.contact,
    ).toEqual({ name: 'Mai', provenance: 'contacts' });
  });

  it('changes nothing when the inviter cancels', async () => {
    native.pick.mockResolvedValueOnce(null);
    await open();
    await fireEvent.changeText(screen.getByTestId('composer-name'), 'Dev');
    await activate(screen.getByTestId('composer-pick-contact'));
    await waitFor(() => expect(native.pick).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('composer-name')).toHaveDisplayValue('Dev');
    expect(toastQueue.getCurrent()).toBeNull();
  });

  it('says so when the picker cannot open', async () => {
    native.pick.mockRejectedValueOnce(new Error('ERR_PICKER_BUSY'));
    await open();
    await activate(screen.getByTestId('composer-pick-contact'));
    await waitFor(() =>
      expect(toastQueue.getCurrent()?.title).toBe(
        'Your contacts didn’t open. Type their name instead.',
      ),
    );
  });

  it('hides the option in a binary without the picker', async () => {
    linked.value = false;
    await open();
    expect(screen.queryByTestId('composer-pick-contact')).toBeNull();
    expect(screen.getByTestId('composer-name')).toBeTruthy();
  });
});
