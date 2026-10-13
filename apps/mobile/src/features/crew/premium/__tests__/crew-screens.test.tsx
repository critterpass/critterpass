/**
 * The premium crew screens over the real local-first stack (encrypted Node database, command
 * client), with synced rows seeded locally and the api answered by recorded responses at the
 * transport: the crew switcher (crews and the invite waiting, switching crews through the queue),
 * starting a crew (its code arriving once the crew syncs), and the crew's own pages (rename, the
 * notification level, removing a member, leaving with the chat kept).
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { ReactElement } from 'react';
import { Alert } from 'react-native';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { CrewSwitcherMenu } from '@/features/home';

import {
  applied,
  queuedPayload as queuedPayload_,
  recordedApi,
  recordingServices,
  renderWithCrew,
} from '../../crews-sheet/test-support/crew-harness';
import { CrewSettingsPremium } from '../crew-settings-screen';
import { EditCrewScreen } from '../edit-crew-screen';
import { LeaveCrewScreen } from '../leave-crew-screen';
import { MemberSheet } from '../member-sheet';
import { StartCrewSheet } from '../start-crew-sheet';

const ME = '0192e1a2-0000-7000-8000-0000000000aa';
const MAYA = '0192e1a2-0000-7000-8000-0000000000bb';
const DEV = '0192e1a2-0000-7000-8000-0000000000cc';
const BALI = '0192e1a2-0000-7000-8000-00000000c001';
const UNI = '0192e1a2-0000-7000-8000-00000000c002';
const RAMEN = '0192e1a2-0000-7000-8000-00000000c003';
const INVITE = '0192e1a2-0000-7000-8000-00000000e001';

const services = recordingServices(ME);
const shared = services.shared;
let stack: TestLocalFirst | null = null;
const renderCrew = (ui: ReactElement) => renderWithCrew(ui, stack!, services);
const queuedPayload = (cmd: string) => queuedPayload_(stack!, cmd);

async function seed(db: TestLocalFirst['db']) {
  // Sixteen local calendar days after the pinned clock (the sheet counts days in the device's zone).
  const start = TRIP_START;
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

/** Local noon on a fixed day, so "in N days" never depends on when or where the suite runs. */
const NOW = new Date(2026, 8, 28, 12, 0);
const TRIP_START = '2026-10-14';

beforeEach(() => {
  // Only Date is pinned: renders, sync and timers still run for real.
  jest.useFakeTimers({
    now: NOW,
    doNotFake: [
      'hrtime',
      'nextTick',
      'performance',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
    ],
  });
  shared.length = 0;
  services.copied.length = 0;
  services.opened.length = 0;
  jest.mocked(router.push).mockClear();
  jest.mocked(router.replace).mockClear();
  jest.mocked(router.back).mockClear();
});
afterEach(async () => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

/** A system alert answered with its last button (the confirming one). */
function confirmAlerts() {
  return jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    buttons?.[buttons.length - 1]?.onPress?.();
  });
}

describe('the crew switcher', () => {
  const menu = (onPick = jest.fn()) => (
    <CrewSwitcherMenu visible top={0} currentCrewId={BALI} onPick={onPick} onClose={jest.fn()} />
  );

  it('lists each crew and the invite waiting for me', async () => {
    stack = await openTestLocalFirst({ holdUploads: true, uid: ME });
    await seed(stack.db);
    await renderCrew(menu());
    expect(await screen.findByTestId(`crew-switcher-${BALI}`)).toBeTruthy();
    expect(screen.getByTestId(`crew-switcher-${UNI}`)).toBeTruthy();
    expect(screen.getByTestId(`crew-switcher-invite-${INVITE}`)).toBeTruthy();
  });

  it('switches the active crew through the offline queue', async () => {
    stack = await openTestLocalFirst({ holdUploads: true, uid: ME });
    await seed(stack.db);
    const onPick = jest.fn();
    await renderCrew(menu(onPick));
    await fireEvent.press(await screen.findByTestId(`crew-switcher-${UNI}`));
    expect(onPick).toHaveBeenCalledWith(UNI);
    await waitFor(async () =>
      expect(await queuedPayload('set_active_crew')).toEqual({ crew_id: UNI }),
    );
  });

  it('joins an in-app invite after a yes, and switches to its crew', async () => {
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
    confirmAlerts();
    const onPick = jest.fn();
    await renderCrew(menu(onPick));
    await fireEvent.press(await screen.findByTestId(`crew-switcher-invite-${INVITE}`));
    await waitFor(() => expect(onPick).toHaveBeenCalledWith(RAMEN));
    expect(api.sent[0]?.body).toMatchObject({
      cmd: 'accept_invite',
      payload: { invite_id: INVITE },
    });
  });
});

describe('start a crew', () => {
  it('queues the crew, then shows and shares its code once it syncs', async () => {
    stack = await openTestLocalFirst({ holdUploads: true, uid: ME });
    await renderCrew(<StartCrewSheet />);
    await fireEvent.changeText(screen.getByTestId('start-crew-name'), '  Lombok   Gang ');
    await fireEvent.press(screen.getByTestId('start-crew-create'));
    await waitFor(async () => expect(await queuedPayload('create_crew')).toBeDefined());
    const payload = (await queuedPayload('create_crew')) as { crew_id: string; name: string };
    expect(payload.name).toBe('Lombok Gang');
    await stack.db.execute(
      "INSERT INTO join_codes (id, crew_id, code, status, target_kind, created_at) VALUES ('jc-9', ?, 'H4RT7N', 'active', 'crew', '2026-09-28')",
      [payload.crew_id],
    );
    await waitFor(() => expect(screen.getByTestId('start-crew-code')).toHaveTextContent(/H4RT7N/u));
    // The code tiles are the copy button's accessible element and read out the code.
    expect(screen.getByTestId('crew-on-code').props.accessibilityLabel).toBe('H4RT7N');
    await fireEvent.press(screen.getByTestId('start-crew-share'));
    expect(shared[0]).toContain('https://critterpass.app/i/H4RT7N');
    await fireEvent.press(screen.getByTestId('start-crew-invite'));
    expect(router.push).toHaveBeenCalledWith(`/crew/${payload.crew_id}/invite`);
  });

  it('keeps the button off until the name is valid', async () => {
    stack = await openTestLocalFirst({ holdUploads: true, uid: ME });
    await renderCrew(<StartCrewSheet />);
    await fireEvent.changeText(screen.getByTestId('start-crew-name'), '   ');
    await fireEvent.press(screen.getByTestId('start-crew-create'));
    expect(await queuedPayload('create_crew')).toBeUndefined();
  });
});

describe("the crew's pages", () => {
  beforeEach(() => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ crewId: BALI, uid: MAYA });
  });

  it('sets the notification level through the queue', async () => {
    stack = await openTestLocalFirst({ uid: ME, holdUploads: true });
    await seed(stack.db);
    await renderCrew(<CrewSettingsPremium />);
    await screen.findByTestId('crew-settings-name');
    await fireEvent.press(screen.getByText('Nothing'));
    await waitFor(async () =>
      expect(await queuedPayload('set_crew_notify')).toEqual({ crew_id: BALI, level: 'off' }),
    );
  });

  it('renames the crew', async () => {
    stack = await openTestLocalFirst({ uid: ME, holdUploads: true });
    await seed(stack.db);
    await renderCrew(<EditCrewScreen />);
    await fireEvent.changeText(await screen.findByTestId('edit-crew-name'), 'Bali Bunch');
    await fireEvent.press(screen.getByLabelText('Save'));
    await waitFor(async () =>
      expect(await queuedPayload('update_crew')).toMatchObject({
        crew_id: BALI,
        name: 'Bali Bunch',
      }),
    );
  });

  it('removes a member only after a yes', async () => {
    stack = await openTestLocalFirst({ uid: ME, holdUploads: true });
    await seed(stack.db);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.[0]?.onPress?.();
    });
    await renderCrew(<MemberSheet />);
    await fireEvent.press(await screen.findByTestId('crew-member-remove'));
    expect(alert).toHaveBeenCalledTimes(1);
    expect(router.back).not.toHaveBeenCalled();
    alert.mockImplementation((_title, _message, buttons) => {
      buttons?.[buttons.length - 1]?.onPress?.();
    });
    await fireEvent.press(screen.getByTestId('crew-member-remove'));
    // Removing leaves the sheet; the crew page holds the Undo before the server hears of it.
    await waitFor(() => expect(router.back).toHaveBeenCalled());
  });

  it('leaves a crew after confirming, keeping the chat when asked', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ crewId: UNI });
    const api = recordedApi({
      leave_crew: applied({ crew_id: UNI, handed_off: [], freed_trips: [] }),
    });
    stack = await openTestLocalFirst({ transport: api, uid: ME, holdUploads: true });
    await seed(stack.db);
    confirmAlerts();
    await renderCrew(<CrewSettingsPremium />);
    await fireEvent.press(await screen.findByTestId('crew-leave-keep-chat'));
    await fireEvent.press(screen.getByTestId('crew-settings-leave'));
    // Back to the Home already underneath, not a second one on top.
    await waitFor(() => expect(router.dismissTo).toHaveBeenCalledWith('/(tabs)'));
    expect(api.sent.find((s) => s.path.endsWith('leave_crew'))?.body).toMatchObject({
      payload: { crew_id: UNI, keep_in_chat: true },
    });
  });

  it("hands an organiser's crew over before leaving it", async () => {
    stack = await openTestLocalFirst({ uid: ME, holdUploads: true });
    await seed(stack.db);
    await renderCrew(<CrewSettingsPremium />);
    await fireEvent.press(await screen.findByTestId('crew-leave-keep-chat'));
    await fireEvent.press(screen.getByTestId('crew-settings-leave'));
    expect(router.push).toHaveBeenCalledWith(`/crew/${BALI}/leave?keep=1`);
  });

  it('hands the crew to the member picked, keeping the chat, then goes home', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ crewId: BALI, keep: '1' });
    const api = recordedApi({ transfer_organiser: applied({ crew_id: BALI }) });
    stack = await openTestLocalFirst({ transport: api, uid: ME, holdUploads: true });
    await seed(stack.db);
    await renderCrew(<LeaveCrewScreen />);
    await fireEvent.press(await screen.findByTestId('crew-leave-handover'));
    await waitFor(() => expect(router.dismissTo).toHaveBeenCalledWith('/(tabs)'));
    expect(api.sent.find((s) => s.path.endsWith('transfer_organiser'))?.body).toMatchObject({
      payload: { crew_id: BALI, leave: true, keep_in_chat: true },
    });
  });
});
