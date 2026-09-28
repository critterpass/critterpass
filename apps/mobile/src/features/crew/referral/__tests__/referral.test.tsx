/**
 * The referral dashboard over the real local-first stack: the link (minted once through the api
 * when the pass has none yet), share and copy, stamp slots and covers from synced referral
 * stamps, and friends listed by status only (a voided referral is not listed, and no activity of
 * theirs is ever shown).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
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

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';

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
import { ReferralScreen } from '../ReferralScreen';
import { REFERRAL_TERMS_URL } from '../terms';

const ME = '0192e1a2-0000-7000-8000-0000000000aa';
const activate = (element: Parameters<typeof fireEvent>[0]) =>
  fireEvent(element, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });

let stack: TestLocalFirst | null = null;
afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

async function seedFriends(db: TestLocalFirst['db']) {
  const friends: [string, string, string, string | null][] = [
    ['r1', 'Dev Patel', 'pending', null],
    ['r2', 'Mai', 'joined', null],
    ['r3', 'Kai', 'qualified', 'stamp'],
    ['r4', 'Sam', 'void', null],
  ];
  for (const [id, name, status, reward] of friends) {
    const uid = `0192e1a2-0000-7000-8000-00000000${id.padStart(4, '0')}`;
    await db.execute('INSERT INTO users (id, display_name) VALUES (?, ?)', [uid, name]);
    await db.execute(
      'INSERT INTO referrals (id, referrer_id, referee_id, status, reward_kind, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, ME, uid, status, reward, `2026-09-2${id.slice(1)}T00:00:00Z`],
    );
  }
  for (let seq = 1; seq <= 3; seq += 1) {
    await db.execute(
      "INSERT INTO stamps (id, user_id, kind, seq_no) VALUES (?, ?, 'referral', ?)",
      [`s${seq}`, ME, seq],
    );
  }
}

describe('invite friends', () => {
  it('mints the link once, then shares and copies it', async () => {
    const api = recordedApi({ mint_referral_code: applied({ code: 'R3FQ7Z' }) });
    stack = await openTestLocalFirst({ transport: api, uid: ME, holdUploads: true });
    const services = recordingServices(ME);
    await renderWithCrew(<ReferralScreen />, stack, services);
    expect(await screen.findByTestId('referral-link')).toHaveTextContent(
      'https://critterpass.app/r/R3FQ7Z',
    );
    expect(api.sent.filter((s) => s.path.endsWith('mint_referral_code'))).toHaveLength(1);
    await activate(screen.getByTestId('referral-share'));
    expect(services.shared[0]).toContain('https://critterpass.app/r/R3FQ7Z');
    await activate(screen.getByTestId('referral-copy'));
    await waitFor(() => expect(services.copied).toEqual(['https://critterpass.app/r/R3FQ7Z']));
    await activate(screen.getByTestId('referral-terms'));
    expect(services.opened).toEqual([REFERRAL_TERMS_URL]);
  });

  it('uses a synced code without asking, and shows stamps, covers and friends by status only', async () => {
    const api = recordedApi({});
    stack = await openTestLocalFirst({ transport: api, uid: ME, holdUploads: true });
    await stack.db.execute(
      "INSERT INTO join_codes (id, code, created_by, target_kind, status, created_at) VALUES ('jc', 'R3FQ7Z', ?, 'referral', 'active', '2026-09-01')",
      [ME],
    );
    await seedFriends(stack.db);
    await renderWithCrew(<ReferralScreen />, stack, recordingServices(ME));
    expect(await screen.findByTestId('referral-link')).toHaveTextContent(
      'https://critterpass.app/r/R3FQ7Z',
    );
    await waitFor(() => expect(screen.getAllByTestId('referral-slot-filled')).toHaveLength(3));
    expect(screen.getAllByTestId('referral-slot-empty')).toHaveLength(2);
    const friends = screen.getByTestId('referral-friends');
    expect(within(friends).getByText('Dev')).toBeTruthy();
    expect(within(friends).getByText('PENDING')).toBeTruthy();
    expect(within(friends).getByText('JOINED')).toBeTruthy();
    expect(within(friends).getByText('STAMPED')).toBeTruthy();
    expect(within(friends).queryByText('Sam')).toBeNull();
    expect(api.sent).toEqual([]);
  });

  it('explains the link waits for a saved pass when it cannot be minted', async () => {
    stack = await openTestLocalFirst({ uid: ME, holdUploads: true });
    await renderWithCrew(<ReferralScreen />, stack, recordingServices(ME));
    expect(await screen.findByTestId('referral-link-pending')).toBeTruthy();
  });
});
