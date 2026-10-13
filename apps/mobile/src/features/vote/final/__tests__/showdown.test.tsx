/**
 * The destination final over the real local-first stack: the showdown states where a tie goes; a
 * vote button queues the ballot and the guide notes an underdog pick; each card counts its votes
 * and says who is still to vote; a poll is drawn only once its votes have been read; a closed poll
 * sends the showdown on to the reveal.
 */
// Loops are timing, not layout: the tests see their resting frame.
jest.mock('@/motion/use-loop', () => ({ useLoop: () => ({}) }));
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: jest.fn(() => ({})),
  Stack: Object.assign(() => null, { Screen: () => null }),
}));

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { router } from 'expo-router';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { ToastHost } from '@/ui/premium';

import type { PollView } from '../../data/poll-view';
import { usePoll } from '../../data/use-poll';
import { voteRoutes } from '../../routes';
import {
  Final,
  OPT_KYOTO,
  OPT_LISBON,
  seedClosed,
  seedFinal,
} from '../../test-support/final-fixtures';
import {
  JORDAN,
  MAYA,
  POLL,
  queued,
  renderVote,
  seedCrew,
  settleMotion,
  until,
} from '../../test-support/vote-harness';

let stack: TestLocalFirst | null = null;

/** The showdown under the toast host, where the guide's word on an underdog pick shows. */
const withToasts = (ui: ReactElement) => <ToastHost bottomOffset={0}>{ui}</ToastHost>;

async function open(): Promise<TestLocalFirst> {
  stack = await openTestLocalFirst({ holdUploads: true });
  await seedCrew(stack);
  return stack;
}

afterEach(async () => {
  (router.push as jest.Mock).mockClear();
  (router.replace as jest.Mock).mockClear();
  (router.back as jest.Mock).mockClear();
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

describe('destination final', () => {
  it('draws a poll only once its options and votes have been read', async () => {
    const s = await open();
    await seedFinal(s, [{ userId: MAYA, optionId: OPT_KYOTO }]);
    // Every poll a surface is handed, from the first read to the last.
    const drawn: PollView[] = [];
    function Probe({ me }: { readonly me: string }) {
      const { poll } = usePoll(POLL, me);
      if (poll !== null) drawn.push(poll);
      return null;
    }
    await renderVote(<Probe me={s.uid} />, s);
    await until(() => drawn.length > 0);
    await settleMotion(300);
    for (const poll of drawn) {
      expect(poll.options).toHaveLength(2);
      expect(poll.votedCount).toBe(1);
    }
  });

  it('casts from a vote button, notes an underdog pick and states the tie rule', async () => {
    const s = await open();
    await seedFinal(s, [{ userId: MAYA, optionId: OPT_KYOTO }]);
    await renderVote(withToasts(<Final me={s.uid} />), s);
    await until(() => screen.queryByTestId('showdown') !== null);
    const tie = within(screen.getByTestId('showdown-tie'));
    expect(
      tie.getByLabelText(
        "Tokek: A tie goes to Kyoto: it's $440 cheaper for the 2 flying from Singapore.",
      ),
    ).toBeTruthy();
    await fireEvent.press(screen.getByTestId('showdown-vote-1'));
    await until(() => screen.queryByText('Voted Lisbon') !== null);
    expect(await queued(s, 'cast_ballot')).toEqual([{ poll_id: POLL, option_id: OPT_LISBON }]);
    await until(() => screen.queryByText(/likes an underdog/) !== null);
  });

  it('keeps both finalists when the viewer casts the deciding ballot', async () => {
    const s = await open();
    // The crew split evenly with the viewer's ballot the last one needed.
    await seedFinal(s, [
      { userId: MAYA, optionId: OPT_KYOTO },
      { userId: JORDAN, optionId: OPT_LISBON },
    ]);
    await renderVote(<Final me={s.uid} />, s);
    await until(() => screen.queryByTestId('showdown-half-1') !== null);
    expect(screen.getByTestId('showdown-half-0')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('showdown-vote-0'));
    await until(() => screen.queryByText('Voted Kyoto') !== null);
    expect(await queued(s, 'cast_ballot')).toEqual([{ poll_id: POLL, option_id: OPT_KYOTO }]);
    expect(screen.getByTestId('showdown-half-0')).toBeTruthy();
    expect(screen.getByTestId('showdown-half-1')).toBeTruthy();
  });

  it('counts each side and says who is still to vote on the trailing one', async () => {
    const s = await open();
    await seedFinal(s, [{ userId: MAYA, optionId: OPT_KYOTO }]);
    await renderVote(<Final me={s.uid} />, s);
    await until(() => screen.queryByTestId('showdown-half-1') !== null);
    const top = within(screen.getByTestId('showdown-half-0'));
    expect(top.getByTestId('showdown-votes-0')).toHaveTextContent(/1 vote/);
    const bottom = within(screen.getByTestId('showdown-half-1'));
    await until(() => bottom.queryByText(/to go/) !== null);
    expect(bottom.getByText('0 votes · Jordan and Winston to go')).toBeTruthy();
  });

  it('sends the showdown on to the reveal once the poll closes', async () => {
    const s = await open();
    await seedClosed(s, [{ userId: MAYA, optionId: OPT_KYOTO }], MAYA);
    await renderVote(<Final me={s.uid} />, s);
    await until(() => (router.replace as jest.Mock).mock.calls.length > 0);
    expect(router.replace).toHaveBeenCalledWith(voteRoutes.reveal(POLL));
  });
});
