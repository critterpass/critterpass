/**
 * The destination final over the real local-first stack: Home's split card says who is still to
 * vote and where a tie goes and opens the showdown; a tap on a showdown half queues the ballot and
 * the guide notes an underdog pick; the bottom side's voters sit in the tally card; a poll is drawn
 * only once its votes have been read; a closed poll sends the showdown on to the reveal.
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
import { fireEvent, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { toastQueue } from '@/motion';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

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

async function open(): Promise<TestLocalFirst> {
  stack = await openTestLocalFirst({ holdUploads: true });
  await seedCrew(stack);
  return stack;
}

afterEach(async () => {
  (router.push as jest.Mock).mockClear();
  (router.replace as jest.Mock).mockClear();
  (router.back as jest.Mock).mockClear();
  toastQueue.dismiss();
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

describe('destination final', () => {
  it('draws the split card with who is to go and the tie line, and opens the showdown', async () => {
    const s = await open();
    await seedFinal(s, [{ userId: MAYA, optionId: OPT_KYOTO }]);
    await renderVote(<Final me={s.uid} view="card" />, s);
    await until(() => screen.queryByTestId('final-split') !== null);
    expect(screen.getByTestId('final-lines')).toHaveTextContent(
      "You haven't voted yet. A tie goes to Kyoto.",
    );
    await until(() => screen.queryByText('JORDAN AND WINSTON TO GO') !== null);
    await fireEvent.press(screen.getByTestId('final-split-open'));
    expect(router.push).toHaveBeenCalledWith(voteRoutes.showdown(POLL));
  });

  it('sets both names on the final card at one size, each whole on its side', async () => {
    const s = await open();
    await seedFinal(s, [{ userId: MAYA, optionId: OPT_KYOTO }]);
    await renderVote(<Final me={s.uid} view="card" />, s);
    await until(() => screen.queryByTestId('final-split') !== null);
    // Each side is `box` wide; its name's one word is `word` wide on a 52-point line.
    const measureName = async (index: number, box: number, word: number) => {
      await fireEvent(screen.getByTestId(`final-name-${index}-box`), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: box, height: 0 } },
      });
      await fireEvent(
        screen.getByTestId(`final-name-${index}-word-0`, { includeHiddenElements: true }),
        'textLayout',
        { nativeEvent: { lines: [{ width: word, height: 52, text: 'KYOTO' }] } },
      );
      await fireEvent(screen.getByTestId(`final-name-${index}`), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: box, height: 52 } },
      });
    };
    const scaleOf = (index: number) => {
      const set = StyleSheet.flatten(
        screen.getByTestId(`final-name-${index}-set`).props.style as StyleProp<ViewStyle>,
      );
      return (set?.transform as { scale: number }[] | undefined)?.[0]?.scale;
    };
    // KYOTO fits its side as designed; LISBON is wider than its side and needs less.
    await measureName(0, 171, 130);
    await measureName(1, 164, 200);
    await until(() => (scaleOf(0) ?? 1) < 1);
    expect(scaleOf(1)).toBeCloseTo(164 / 202, 5);
    expect(scaleOf(0)).toBeCloseTo(scaleOf(1) ?? 0, 5);
  });

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

  it('casts from a showdown half, notes an underdog pick and states the tie rule', async () => {
    const s = await open();
    await seedFinal(s, [{ userId: MAYA, optionId: OPT_KYOTO }]);
    await renderVote(<Final me={s.uid} view="showdown" />, s);
    await until(() => screen.queryByTestId('showdown') !== null);
    expect(screen.getByTestId('showdown-hint')).toBeTruthy();
    expect(screen.getByTestId('showdown-tie')).toHaveTextContent(
      "A tie goes to Kyoto: it's $440 cheaper for the 2 flying from Singapore.",
    );
    await fireEvent.press(screen.getByTestId('showdown-half-1'));
    await until(() => screen.queryByTestId('showdown-hint') === null);
    expect(await queued(s, 'cast_ballot')).toEqual([{ poll_id: POLL, option_id: OPT_LISBON }]);
    await until(() => toastQueue.getCurrent()?.title.includes('underdog') === true);
  });

  it('shows both finalists before and after the viewer casts the deciding ballot', async () => {
    const s = await open();
    // The crew split evenly with the viewer's ballot the last one needed.
    await seedFinal(s, [
      { userId: MAYA, optionId: OPT_KYOTO },
      { userId: JORDAN, optionId: OPT_LISBON },
    ]);
    await renderVote(<Final me={s.uid} view="showdown" />, s);
    await until(() => screen.queryByText('LISBON') !== null);
    const visible = (testID: string) => {
      const half = screen.getByTestId(testID).children[0];
      if (half === undefined || typeof half === 'string') return false;
      return StyleSheet.flatten(half.props.style as StyleProp<ViewStyle>)?.opacity !== 0;
    };
    expect(screen.getByText('KYOTO')).toBeTruthy();
    expect(visible('showdown-half-0')).toBe(true);
    expect(visible('showdown-half-1')).toBe(true);
    await fireEvent.press(screen.getByTestId('showdown-half-0'));
    await until(() => screen.queryByTestId('showdown-hint') === null);
    expect(await queued(s, 'cast_ballot')).toEqual([{ poll_id: POLL, option_id: OPT_KYOTO }]);
    expect(visible('showdown-half-0')).toBe(true);
    expect(visible('showdown-half-1')).toBe(true);
  });

  it("lists the top side's voters under its chips and the bottom side's in the tally card", async () => {
    const s = await open();
    await seedFinal(s, [
      { userId: MAYA, optionId: OPT_KYOTO },
      { userId: JORDAN, optionId: OPT_LISBON },
    ]);
    await renderVote(<Final me={s.uid} view="showdown" />, s);
    await until(() => screen.queryByText('LISBON') !== null);
    const top = within(screen.getByTestId('showdown-half-0'));
    expect(top.getByTestId('showdown-votes-0')).toHaveTextContent(/1 VOTE$/);
    // The bottom half keeps its height for its name: its voters and count are in the card.
    const bottom = within(screen.getByTestId('showdown-half-1'));
    expect(bottom.queryByTestId('showdown-votes-1')).toBeNull();
    const footer = within(screen.getByTestId('showdown-footer'));
    expect(footer.getByTestId('showdown-votes-1')).toBeTruthy();
    expect(footer.getByText('1 VOTE · WINSTON TO GO')).toBeTruthy();
  });

  it('keeps each half clear of the header and the tally card however tall they get', async () => {
    const s = await open();
    await seedFinal(s, [{ userId: MAYA, optionId: OPT_KYOTO }]);
    await renderVote(<Final me={s.uid} view="showdown" />, s);
    await until(() => screen.queryByText('LISBON') !== null);
    const padding = (testID: string) => {
      const half = screen.getByTestId(testID).children[0];
      if (half === undefined || typeof half === 'string') return {};
      return StyleSheet.flatten(half.props.style as StyleProp<ViewStyle>) ?? {};
    };
    const layout = (height: number) => ({
      nativeEvent: { layout: { x: 0, y: 0, width: 360, height } },
    });
    await fireEvent(screen.getByTestId('showdown-footer'), 'layout', layout(180));
    await fireEvent(screen.getByTestId('showdown-header'), 'layout', layout(40));
    expect(padding('showdown-half-1').paddingBottom).toBeGreaterThan(180);
    expect(padding('showdown-half-0').paddingTop).toBeGreaterThan(40);
    await fireEvent(screen.getByTestId('showdown-footer'), 'layout', layout(260));
    expect(padding('showdown-half-1').paddingBottom).toBeGreaterThan(260);
  });

  it('sends the showdown on to the reveal once the poll closes', async () => {
    const s = await open();
    await seedClosed(s, [{ userId: MAYA, optionId: OPT_KYOTO }], MAYA);
    await renderVote(<Final me={s.uid} view="showdown" />, s);
    await until(() => (router.replace as jest.Mock).mock.calls.length > 0);
    expect(router.replace).toHaveBeenCalledWith(voteRoutes.reveal(POLL));
  });
});
