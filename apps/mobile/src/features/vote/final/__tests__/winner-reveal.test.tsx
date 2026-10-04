/**
 * The winner reveal over the real local-first stack: it files `mark_reveal_seen` once, gives the
 * organiser the setup and tells everyone else who has it, with lines for a missed vote and a losing
 * pick; reduced motion shows the finished result; Home opens a pending reveal once and never again
 * after it has been seen.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('@/ui/sticker/Sticker', () => require('@/ui/avatar/test-support/sticker-double'));
// Loops are timing, not layout: the tests see their resting frame.
jest.mock('@/motion/use-loop', () => ({ useLoop: () => ({}) }));
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: jest.fn(() => ({})),
}));

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useMotionMode } from '@/motion';
import { resetMotionModeForTests } from '@/motion/test-support/reset-motion-mode';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import { useRevealOnOpen } from '../../data/use-final';
import { useMyUid } from '../../data/use-my-uid';
import { voteRoutes } from '../../routes';
import { OPT_KYOTO, OPT_LISBON, Reveal, seedClosed } from '../../test-support/final-fixtures';
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
import { WinnerRevealScreen } from '../winner-reveal';

let stack: TestLocalFirst | null = null;

async function open(): Promise<TestLocalFirst> {
  stack = await openTestLocalFirst({ holdUploads: true });
  await seedCrew(stack);
  return stack;
}

async function setReducedMotion(): Promise<void> {
  const { result, unmount } = await renderHook(() => useMotionMode());
  await act(() => {
    result.current[1]('reduced');
  });
  await unmount();
}

afterEach(async () => {
  await resetMotionModeForTests();
  (router.push as jest.Mock).mockClear();
  (router.replace as jest.Mock).mockClear();
  (router.back as jest.Mock).mockClear();
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

function HomeGate() {
  useRevealOnOpen(useMyUid());
  return null;
}

describe('winner reveal', () => {
  it('marks the reveal seen once and gives the organiser the setup', async () => {
    const s = await open();
    await seedClosed(
      s,
      [
        { userId: s.uid, optionId: OPT_KYOTO },
        { userId: MAYA, optionId: OPT_KYOTO },
        { userId: JORDAN, optionId: OPT_LISBON },
      ],
      s.uid,
    );
    await renderVote(<Reveal me={s.uid} />, s);
    // Who organises loads after the result: the set-up button replaces the "organiser sets it up" line.
    await until(() => screen.queryByTestId('reveal-set-up') !== null);
    expect(screen.getByText('WINS 2–1')).toBeTruthy();
    expect(screen.queryByTestId('reveal-lost')).toBeNull();
    await until(() => screen.queryByTestId('reveal-stamp') !== null);
    // The reveal files the command from a mount effect and the queue write is asynchronous: the
    // stamp can draw before the row is written.
    await waitFor(async () =>
      expect(await queued(s, 'mark_reveal_seen')).toEqual([{ poll_id: POLL }]),
    );
  });

  it('tells a crewmate whose pick lost who has the setup', async () => {
    const s = await open();
    await seedClosed(
      s,
      [
        { userId: s.uid, optionId: OPT_LISBON },
        { userId: MAYA, optionId: OPT_KYOTO },
        { userId: JORDAN, optionId: OPT_KYOTO },
      ],
      MAYA,
    );
    await renderVote(<Reveal me={s.uid} />, s);
    // The organiser's name loads after the result, replacing the generic line.
    await until(() => screen.queryByText('Setup is with Maya.') !== null);
    expect(screen.getByTestId('reveal-setup-with')).toHaveTextContent('Setup is with Maya.');
    expect(screen.getByTestId('reveal-lost')).toBeTruthy();
    expect(screen.queryByTestId('reveal-set-up')).toBeNull();
  });

  it('shows a place the organiser locked in before anyone voted as locked in, not as a vote', async () => {
    const s = await open();
    await seedClosed(s, [], s.uid);
    await renderVote(<Reveal me={s.uid} />, s);
    await until(() => screen.queryByTestId('reveal-set-up') !== null);
    expect(screen.getByTestId('reveal-locked-in')).toBeTruthy();
    expect(screen.getByTestId('reveal-score')).toHaveTextContent('LOCKED IN');
    expect(screen.queryByTestId('reveal-missed')).toBeNull();
  });

  it('tells someone who missed the vote what the crew picked', async () => {
    const s = await open();
    await seedClosed(s, [{ userId: MAYA, optionId: OPT_KYOTO }], MAYA);
    await renderVote(<Reveal me={s.uid} />, s);
    await until(() => screen.queryByTestId('reveal-missed') !== null);
    expect(screen.getByTestId('reveal-missed')).toHaveTextContent(
      'You missed this vote. The crew picked Kyoto.',
    );
  });

  it('draws the result as designed: the score, the tally in each place colour, the sleeping guide', async () => {
    const s = await open();
    await seedClosed(
      s,
      [
        { userId: s.uid, optionId: OPT_KYOTO },
        { userId: MAYA, optionId: OPT_KYOTO },
        { userId: JORDAN, optionId: OPT_LISBON },
      ],
      s.uid,
    );
    await renderVote(<Reveal me={s.uid} />, s);
    await until(() => screen.queryByTestId('reveal-set-up') !== null);
    expect(screen.getByTestId('reveal-voted')).toHaveTextContent('3 OF 3 VOTED');
    expect(screen.getByTestId('reveal-name')).toHaveTextContent('KYOTO');
    expect(screen.getByTestId('reveal-score')).toHaveTextContent('WINS 2–1');
    expect(screen.getByTestId('reveal-tally').props.accessibilityLabel).toBe(
      'Kyoto. Wins 2–1; Kyoto, 2 votes; Lisbon, 1 votes',
    );
    expect(screen.getByTestId('reveal-consolation')).toHaveTextContent(
      'Tokek took it well. Already pitching the next trip.',
    );
    expect(screen.getByText('Lisbon goes back in the deck for next time')).toBeTruthy();
    // Full motion: the rays turn behind the guide.
    expect(screen.getByTestId('reveal-rays')).toBeTruthy();
  });

  it('shows the finished result, with no burst flash, under reduced motion', async () => {
    const s = await open();
    await seedClosed(s, [{ userId: MAYA, optionId: OPT_KYOTO }], MAYA);
    await setReducedMotion();
    await renderVote(<Reveal me={s.uid} />, s);
    await until(() => screen.queryByTestId('reveal-missed') !== null);
    expect(screen.getByTestId('reveal-rays')).toBeTruthy();
    expect(screen.getByTestId('reveal-name')).toHaveTextContent('KYOTO');
    expect(screen.getByTestId('reveal-score')).toHaveTextContent('WINS 1–0');
    expect(screen.queryByTestId('reveal-burst-flash')).toBeNull();
  });

  it('does not open a reveal already seen on another device', async () => {
    const s = await open();
    await seedClosed(s, [{ userId: MAYA, optionId: OPT_KYOTO }], MAYA, '2026-10-02T01:00:00Z');
    await renderVote(<HomeGate />, s);
    await settleMotion();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('leaves instead of replaying a reveal seen before the screen opened', async () => {
    const s = await open();
    await seedClosed(s, [{ userId: MAYA, optionId: OPT_KYOTO }], MAYA, '2026-10-02T10:00:00Z');
    await renderVote(<WinnerRevealScreen pollId={POLL} />, s);
    await until(() => (router.back as jest.Mock).mock.calls.length > 0);
    expect(screen.queryByTestId('winner-reveal')).toBeNull();
    expect(await queued(s, 'mark_reveal_seen')).toEqual([]);
  });

  it('opens a pending reveal from Home once', async () => {
    const s = await open();
    await seedClosed(s, [{ userId: MAYA, optionId: OPT_KYOTO }], MAYA);
    await renderVote(<HomeGate />, s);
    await until(() => (router.push as jest.Mock).mock.calls.length > 0);
    expect(router.push).toHaveBeenCalledWith(voteRoutes.reveal(POLL));
    await renderVote(<HomeGate />, s);
    await settleMotion();
    expect(router.push).toHaveBeenCalledTimes(1);
  });
});
