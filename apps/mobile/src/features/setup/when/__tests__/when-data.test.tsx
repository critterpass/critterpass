/**
 * The dates step's local reads and the member's answer to a private ask, over the real
 * local-first stack: counts and options from synced rows, an ask queued on this phone showing as
 * asked at once, and "Freed it" / words queuing `answer_availability_ask` while offline.
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
  router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn() },
}));

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, renderHook, screen, waitFor } from '@testing-library/react-native';

import { askAvailabilityCommand } from '@/features/setup/data/commands';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import { DEV, kyotoTrip, TRIP_ID } from '../../scenes/fixtures';
import { renderSetup, seedKyoto } from '../../test-support/setup-harness';
import { AskSheet } from '../ask-sheet';
import { useWhenData } from '../use-when-data';

// Real encrypted databases and queues: CI runners are about three times slower than a laptop.
jest.setTimeout(60_000);

let stack: TestLocalFirst | null = null;

afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

async function seedOptions(s: TestLocalFirst): Promise<void> {
  await s.db.execute(
    `INSERT INTO availability_summaries (id, trip_id, date, free_count, maybe_count, busy_count,
       unknown_count, member_count) VALUES ('s1', ?, '2027-04-02', 5, 1, 0, 0, 6)`,
    [TRIP_ID],
  );
  await s.db.execute(
    `INSERT INTO date_window_options (id, trip_id, position, kind, start_date, end_date,
       free_count, member_count, missing_member_ids, missed_must_do_ids, ask_user_id, reason, is_pick)
     VALUES ('o-ask', ?, 2, 'ask_first', '2027-04-02', '2027-04-09', 5, 6, ?, '[]', ?, 'maybe_block', 1)`,
    [TRIP_ID, JSON.stringify([DEV]), DEV],
  );
  await s.db.execute(`INSERT INTO must_dos (id, trip_id, title) VALUES ('m1', ?, 'Inari')`, [
    TRIP_ID,
  ]);
}

describe('dates step data', () => {
  it('reads counts and options, and shows an ask queued on this phone as asked', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    await seedKyoto(stack);
    await seedOptions(stack);
    const { result } = await renderHook(() => useWhenData(TRIP_ID), { wrapper: stack.wrapper });
    // Each table is its own live query, so wait until every one of them has landed.
    await waitFor(() => {
      expect(result.current.options).toHaveLength(1);
      expect(result.current.summaries[0]?.free_count).toBe(5);
      expect(result.current.mustDoTitles.get('m1')).toBe('Inari');
    });
    expect(result.current.options[0]).toMatchObject({ kind: 'ask_first', askState: null });

    const sent = await stack.value.commands.send(askAvailabilityCommand, {
      trip_id: TRIP_ID,
      target_uid: DEV,
      range: { start: '2027-04-02', end: '2027-04-09' },
      option_id: 'o-ask',
    });
    expect(sent.kind).toBe('queued');
    await waitFor(() => expect(result.current.options[0]?.askState).toBe('asked'));
  });
});

describe('answering the guide’s ask', () => {
  it('queues “Freed it” offline and says what the organiser will learn', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    await renderSetup(<AskSheet trip={kyotoTrip({ me: DEV })} askId="ask-1" />, { stack });
    expect(
      screen.getByText('Winston only hears whether the week works. Never what the block is.'),
    ).toBeTruthy();
    await fireEvent.press(screen.getByTestId('ask-freed'));
    await waitFor(async () => {
      const rows = await stack!.db.getAll<{ envelope: string }>(
        "SELECT envelope FROM commands WHERE cmd = 'answer_availability_ask'",
      );
      expect((JSON.parse(rows[0]?.envelope ?? '{}') as { payload: unknown }).payload).toEqual({
        ask_id: 'ask-1',
        answer: 'freed',
      });
    });
    expect(
      await screen.findByText('Thanks. I’ll only tell Winston whether the week works.'),
    ).toBeTruthy();
  });

  it('sends a reply in words for the guide to read', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    await renderSetup(<AskSheet trip={kyotoTrip({ me: DEV })} askId="ask-2" />, { stack });
    await fireEvent.changeText(screen.getByTestId('ask-words'), 'I can move it to the 12th');
    await fireEvent.press(screen.getByTestId('ask-send'));
    await waitFor(async () => {
      const rows = await stack!.db.getAll<{ envelope: string }>('SELECT envelope FROM commands');
      expect((JSON.parse(rows[0]?.envelope ?? '{}') as { payload: unknown }).payload).toEqual({
        ask_id: 'ask-2',
        text: 'I can move it to the 12th',
      });
    });
  });
});
