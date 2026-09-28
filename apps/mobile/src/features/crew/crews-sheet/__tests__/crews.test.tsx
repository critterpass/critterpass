/**
 * The crew screens over the real local-first stack (encrypted Node database, command client), with
 * synced rows seeded locally and the api answered by recorded responses at the transport: the crews
 * sheet (cards, status lines, the badge slot, invites answered JOIN or LATER, switching crews),
 * starting a crew (its code, or the code arriving once the crew syncs), and crew settings (rename,
 * notification level, code rotation, removing a member, leaving).
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
import { router, useLocalSearchParams } from 'expo-router';
import type { ReactElement } from 'react';
import { Text } from 'react-native';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import { CrewSettingsScreen } from '../../settings/CrewSettingsScreen';
import { StartCrewScreen } from '../../start-crew/StartCrewScreen';
import { registerCrewCardBadge } from '../badge-slot';
import { CrewsSheet } from '../CrewsSheet';
import {
  applied,
  queuedPayload as queuedPayload_,
  recordedApi,
  recordingServices,
  renderWithCrew,
} from '../test-support/crew-harness';

const ME = '0192e1a2-0000-7000-8000-0000000000aa';
const MAYA = '0192e1a2-0000-7000-8000-0000000000bb';
const DEV = '0192e1a2-0000-7000-8000-0000000000cc';
const BALI = '0192e1a2-0000-7000-8000-00000000c001';
const UNI = '0192e1a2-0000-7000-8000-00000000c002';
const RAMEN = '0192e1a2-0000-7000-8000-00000000c003';
const INVITE = '0192e1a2-0000-7000-8000-00000000e001';

const activate = (element: Parameters<typeof fireEvent>[0]) =>
  fireEvent(element, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });

const services = recordingServices(ME);
const shared = services.shared;
let stack: TestLocalFirst | null = null;
const renderCrew = (ui: ReactElement) => renderWithCrew(ui, stack!, services);
const queuedPayload = (cmd: string) => queuedPayload_(stack!, cmd);

async function seed(db: TestLocalFirst['db']) {
  const start = new Date(Date.now() + 16 * 86_400_000).toISOString().slice(0, 10);
  for (const [id, name] of [
    [ME, 'Rin'],
    [MAYA, 'Maya Chen'],
    [DEV, 'Dev'],
  ] as const) {
    await db.execute('INSERT INTO users (id, display_name) VALUES (?, ?)', [id, name]);
  }
  for (const [id, name, by] of [
    [BALI, 'The Bali Six', ME],
    [UNI, 'Uni Housemates', MAYA],
    [RAMEN, 'Ramen Club', DEV],
  ] as const) {
    await db.execute('INSERT INTO crews (id, name, created_by) VALUES (?, ?, ?)', [id, name, by]);
  }
  const members: [string, string, string, string][] = [
    [BALI, ME, 'organiser', 'yellow'],
    [BALI, MAYA, 'member', 'orange'],
    [UNI, MAYA, 'organiser', 'yellow'],
    [UNI, ME, 'member', 'orange'],
    [UNI, DEV, 'member', 'blue'],
  ];
  for (const [index, [crew, user, role, colour]] of members.entries()) {
    await db.execute(
      "INSERT INTO crew_members (id, crew_id, user_id, role, colour, status, created_at) VALUES (?, ?, ?, ?, ?, 'active', ?)",
      [`cm-${index}`, crew, user, role, colour, `2026-09-0${index + 1}T00:00:00Z`],
    );
  }
  await db.execute("INSERT INTO destinations (id, slug, name) VALUES ('d-1', 'bali', 'Bali')");
  await db.execute(
    "INSERT INTO trips (id, crew_id, status, destination_id, start_date) VALUES ('t-1', ?, 'setup', 'd-1', ?)",
    [BALI, start],
  );
  await db.execute(
    "INSERT INTO join_codes (id, crew_id, code, status, target_kind, created_at) VALUES ('jc-1', ?, 'K7M2QX', 'active', 'crew', '2026-09-01')",
    [BALI],
  );
  await db.execute(
    "INSERT INTO invites (id, crew_id, inviter_id, invitee_user_id, status, expires_at) VALUES (?, ?, ?, ?, 'pending', '2999-01-01T00:00:00Z')",
    [INVITE, RAMEN, DEV, ME],
  );
  await db.execute('INSERT INTO user_settings (id, user_id, active_crew_id) VALUES (?, ?, ?)', [
    ME,
    ME,
    BALI,
  ]);
}

beforeEach(() => {
  shared.length = 0;
  services.copied.length = 0;
  services.opened.length = 0;
  jest.mocked(router.push).mockClear();
  jest.mocked(router.replace).mockClear();
  jest.mocked(router.back).mockClear();
});
afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

describe('3g-3 your crews', () => {
  it('lists each crew with its members and next trip, and the invite waiting for me', async () => {
    stack = await openTestLocalFirst({ holdUploads: true, uid: ME });
    await seed(stack.db);
    const stop = registerCrewCardBadge(({ crewId }) => <Text testID={`badge-${crewId}`}>5</Text>);
    await renderCrew(<CrewsSheet />);
    expect(await screen.findByText(/^the bali six$/iu)).toBeTruthy();
    expect(screen.getByText('Bali in 16 days')).toBeTruthy();
    expect(screen.getByText('Nothing planned yet')).toBeTruthy();
    expect(screen.getByTestId(`badge-${BALI}`)).toBeTruthy();
    expect(screen.getByText(/^ramen club$/iu)).toBeTruthy();
    expect(screen.getByText('Dev invited you')).toBeTruthy();
    stop();
  });

  it('switches the active crew through the offline queue and closes', async () => {
    stack = await openTestLocalFirst({ holdUploads: true, uid: ME });
    await seed(stack.db);
    await renderCrew(<CrewsSheet />);
    await fireEvent.press(await screen.findByText(/^uni housemates$/iu));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    await waitFor(async () =>
      expect(await queuedPayload('set_active_crew')).toEqual({ crew_id: UNI }),
    );
  });

  it('joins an in-app invite and marks it joined', async () => {
    const api = recordedApi({
      accept_invite: applied({
        crew_id: RAMEN,
        trip_id: null,
        invite_id: INVITE,
        joined: true,
        seated: false,
        waitlisted: false,
        waitlist_position: null,
        forwarded: false,
      }),
    });
    stack = await openTestLocalFirst({ transport: api, uid: ME });
    await seed(stack.db);
    await renderCrew(<CrewsSheet />);
    await activate(await screen.findByTestId(`crew-invite-join-${INVITE}`));
    expect(await screen.findByText(/joined ✓/iu)).toBeTruthy();
    expect(api.sent[0]?.body).toMatchObject({
      cmd: 'accept_invite',
      payload: { invite_id: INVITE },
    });
  });

  it('keeps a deferred invite under Later', async () => {
    stack = await openTestLocalFirst({ holdUploads: true, uid: ME });
    await seed(stack.db);
    await stack.db.execute("UPDATE invites SET status = 'later' WHERE id = ?", [INVITE]);
    await renderCrew(<CrewsSheet />);
    expect(await screen.findByText(/^later$/iu)).toBeTruthy();
    expect(screen.queryByTestId(`crew-invite-later-${INVITE}`)).toBeNull();
  });
});

describe('start a crew', () => {
  it('queues the crew, then shows and shares its code once it syncs', async () => {
    stack = await openTestLocalFirst({ holdUploads: true, uid: ME });
    await renderCrew(<StartCrewScreen />);
    await fireEvent.changeText(screen.getByTestId('start-crew-name'), '  Lombok   Gang ');
    await activate(screen.getByTestId('start-crew-create'));
    expect(await screen.findByText(/arrives once you’re back online/u)).toBeTruthy();
    const payload = (await queuedPayload('create_crew')) as { crew_id: string; name: string };
    expect(payload.name).toBe('Lombok Gang');
    await stack.db.execute(
      "INSERT INTO join_codes (id, crew_id, code, status, target_kind, created_at) VALUES ('jc-9', ?, 'H4RT7N', 'active', 'crew', '2026-09-28')",
      [payload.crew_id],
    );
    expect(await screen.findByTestId('start-crew-code')).toHaveTextContent('H4RT7N');
    await activate(screen.getByTestId('start-crew-share'));
    expect(shared[0]).toContain('https://critterpass.app/i/H4RT7N');
  });

  it('keeps the button off until the name is valid', async () => {
    stack = await openTestLocalFirst({ holdUploads: true, uid: ME });
    await renderCrew(<StartCrewScreen />);
    expect(screen.getByTestId('start-crew-create')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('start-crew-name'), '   ');
    expect(screen.getByTestId('start-crew-create')).toBeDisabled();
  });
});

describe('crew settings', () => {
  beforeEach(() => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ crewId: BALI });
  });

  it('renames, mutes, rotates the code and removes a member', async () => {
    const api = recordedApi({
      rotate_join_code: applied({
        crew_id: BALI,
        code: 'P9TQ4W',
        expires_at: '2026-10-12T00:00:00Z',
      }),
      remove_member: applied({ crew_id: BALI, handed_off: [], freed_trips: [] }),
    });
    stack = await openTestLocalFirst({ transport: api, uid: ME, holdUploads: true });
    await seed(stack.db);
    await renderCrew(<CrewSettingsScreen />);
    expect(await screen.findByTestId('crew-settings-code')).toHaveTextContent('K7M2QX');
    expect(screen.getByText('Maya')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('crew-settings-name'), 'Bali Bunch');
    await activate(screen.getByTestId('crew-settings-rename'));
    await waitFor(async () =>
      expect(await queuedPayload('update_crew')).toEqual({ crew_id: BALI, name: 'Bali Bunch' }),
    );
    await fireEvent.press(screen.getByText(/^off$/iu));
    await waitFor(async () =>
      expect(await queuedPayload('set_crew_notify')).toEqual({ crew_id: BALI, level: 'off' }),
    );
    await activate(screen.getByTestId('crew-settings-rotate'));
    await waitFor(() =>
      expect(api.sent.some((s) => s.path.endsWith('rotate_join_code'))).toBe(true),
    );
    await fireEvent.press(screen.getByText('Remove Maya'));
    await activate(await screen.findByText(/^remove$/iu));
    await waitFor(() => expect(api.sent.some((s) => s.path.endsWith('remove_member'))).toBe(true));
  });

  it('leaves the crew after confirming, keeping the chat when asked', async () => {
    const api = recordedApi({
      leave_crew: applied({ crew_id: BALI, handed_off: [], freed_trips: [] }),
    });
    stack = await openTestLocalFirst({ transport: api, uid: ME, holdUploads: true });
    await seed(stack.db);
    await renderCrew(<CrewSettingsScreen />);
    await fireEvent(await screen.findByTestId('crew-leave-keep-chat'), 'valueChange', true);
    await fireEvent.press(screen.getByText('Leave the crew'));
    await activate(await screen.findByText(/^leave$/iu));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
    expect(api.sent.find((s) => s.path.endsWith('leave_crew'))?.body).toMatchObject({
      payload: { crew_id: BALI },
    });
  });

  it('says so when the crew has not synced yet', async () => {
    jest
      .mocked(useLocalSearchParams)
      .mockReturnValue({ crewId: '0192e1a2-0000-7000-8000-00000000dead' });
    stack = await openTestLocalFirst({ holdUploads: true, uid: ME });
    await renderCrew(<CrewSettingsScreen />);
    expect(
      await screen.findByTestId('crew-settings-missing', { includeHiddenElements: true }),
    ).toBeTruthy();
  });
});
