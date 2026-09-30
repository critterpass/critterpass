/**
 * The destination final over the real local-first stack: Home's split card says who is still to
 * vote and where a tie goes and opens the showdown; a tap on a showdown half queues the ballot and
 * the guide notes an underdog pick; the reveal files `mark_reveal_seen` once, gives the organiser
 * the setup and tells everyone else who has it, with lines for a missed vote and a losing pick;
 * Home opens a pending reveal once and never again after it has been seen.
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
import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { toastQueue } from '@/motion';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import { useRevealOnOpen } from '../../data/use-final';
import { useMyUid } from '../../data/use-my-uid';
import { usePoll } from '../../data/use-poll';
import { voteRoutes } from '../../routes';
import {
  CREW,
  JORDAN,
  KYOTO,
  LISBON,
  MAYA,
  POLL,
  TRIP,
  queued,
  renderVote,
  seedCrew,
  seedPoll,
  settleMotion,
  until,
} from '../../test-support/vote-harness';
import { FinalSplitCard } from '../final-split-card';
import {
  DESIGN_SEARCH,
  guessNameLine,
  nextNameSearch,
  scalesAt,
  splitsWord,
  type HalfMeasure,
} from '../showdown-name-fit';
import { ShowdownView } from '../showdown-screen';
import { WinnerRevealScreen, WinnerRevealView } from '../winner-reveal';

const OPT_KYOTO = '0192f000-0000-7000-8000-000000000711';
const OPT_LISBON = '0192f000-0000-7000-8000-000000000712';
const TIE = {
  rule: 'cheaper_for_majority_origin',
  winner_option_id: OPT_KYOTO,
  cheaper_by_minor: 44000,
  currency: 'USD',
  origin: 'SIN',
  member_count: 2,
};
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

const FINALISTS = [
  { id: OPT_KYOTO, label: 'Kyoto', refId: KYOTO },
  { id: OPT_LISBON, label: 'Lisbon', refId: LISBON },
];

async function seedFinal(s: TestLocalFirst, ballots: { userId: string; optionId: string }[]) {
  await seedPoll(s, {
    kind: 'destination',
    stage: 'final',
    question: null,
    options: FINALISTS,
    ballots,
    result: { tie_preview: TIE },
  });
}

async function seedClosed(
  s: TestLocalFirst,
  ballots: { userId: string; optionId: string }[],
  organiser: string,
  seenAt: string | null = null,
) {
  await seedPoll(s, {
    kind: 'destination',
    stage: 'final',
    status: 'closed',
    question: null,
    options: FINALISTS,
    ballots,
    winnerOptionId: OPT_KYOTO,
    createdBy: MAYA,
  });
  await s.db.execute('INSERT INTO trips (id, crew_id, status) VALUES (?, ?, ?)', [
    TRIP,
    CREW,
    'planning',
  ]);
  await s.db.execute(
    `INSERT INTO trip_participants (id, trip_id, user_id, role, created_at)
     VALUES ('tp-1', ?, ?, 'organiser', '2026-10-01T00:00:00Z')`,
    [TRIP, organiser],
  );
  await s.db.execute(
    `INSERT INTO poll_reveals (id, poll_id, user_id, seen_at, created_at)
     VALUES ('rv-1', ?, ?, ?, '2026-10-02T00:00:00Z')`,
    [POLL, s.uid, seenAt],
  );
}

function Final({ me, view }: { readonly me: string; readonly view: 'card' | 'showdown' }) {
  const { poll } = usePoll(POLL, me);
  if (poll === null) return null;
  return view === 'card' ? <FinalSplitCard poll={poll} /> : <ShowdownView poll={poll} />;
}

function Reveal({ me }: { readonly me: string }) {
  const { poll } = usePoll(POLL, me);
  return poll === null || poll.status !== 'closed' ? null : (
    <WinnerRevealView poll={poll} me={me} />
  );
}

function HomeGate() {
  useRevealOnOpen(useMyUid());
  return null;
}

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

  it('sets both names smaller at one size only when the halves overflow the screen', async () => {
    const s = await open();
    await seedFinal(s, [{ userId: MAYA, optionId: OPT_KYOTO }]);
    await renderVote(<Final me={s.uid} view="showdown" />, s);
    await until(() => screen.queryByText('LISBON') !== null);
    const layout = (y: number, width: number, height: number) => ({
      nativeEvent: { layout: { x: 0, y, width, height } },
    });
    const lines = (width: number, height: number) => ({
      nativeEvent: { lines: [{ width, height, text: 'KYOTO' }] },
    });
    const nameWidth = (index: number) =>
      StyleSheet.flatten(
        screen.getByTestId(`showdown-name-${index}`).props.style as StyleProp<ViewStyle>,
      )?.width;
    await fireEvent(screen.getByTestId('showdown-body'), 'layout', layout(0, 360, 700));
    await fireEvent(screen.getByTestId('showdown-name-0'), 'textLayout', lines(300, 150));
    await fireEvent(screen.getByTestId('showdown-name-0'), 'layout', layout(0, 300, 150));
    await fireEvent(screen.getByTestId('showdown-name-1'), 'textLayout', lines(280, 120));
    await fireEvent(screen.getByTestId('showdown-name-1'), 'layout', layout(0, 280, 120));
    // Both halves fit the screen: both names keep their designed size.
    await fireEvent(screen.getByTestId('showdown-votes-0'), 'layout', layout(250, 300, 30));
    await fireEvent(screen.getByTestId('showdown-votes-1'), 'layout', layout(250, 300, 30));
    expect(nameWidth(0)).toBeUndefined();
    expect(nameWidth(1)).toBeUndefined();
    // The lower half's chips wrap taller: both names are set in narrower boxes.
    await fireEvent(screen.getByTestId('showdown-votes-1'), 'layout', layout(420, 300, 30));
    await until(() => nameWidth(0) !== undefined && nameWidth(1) !== undefined);
    expect(nameWidth(0)).toBeLessThan(300);
    expect(nameWidth(1)).toBeLessThan(280);
  });

  it('keeps the designed size when the halves fit, and shrinks both names equally when not', () => {
    const half = (designLine: number, natural: number) => ({
      name: {
        designHeight: designLine,
        designWidth: 300,
        designLine,
        height: designLine,
        split: false,
      },
      natural,
    });
    // The layout as the device would measure it at a shared line height.
    const totalAt = (halves: readonly [HalfMeasure, HalfMeasure], line: number | null) => {
      const scales = scalesAt(halves, line);
      return halves.reduce(
        (sum, h, i) => sum + h.natural - h.name.height + h.name.designHeight * (scales[i] ?? 1),
        0,
      );
    };
    // A name set below `breakAt` line height splits a word.
    const run = (halves: readonly [HalfMeasure, HalfMeasure], viewport: number, breakAt = 0) => {
      let search = DESIGN_SEARCH;
      for (let step = 0; step < 20 && !search.done; step += 1) {
        const fits = totalAt(halves, search.line) <= viewport;
        const broke = search.line !== null && search.line < breakAt;
        search = nextNameSearch(search, fits, broke, guessNameLine(halves, viewport) ?? 150, 150);
      }
      return search;
    };
    // English: a big KYOTO and a smaller LISBON, 690 of 700 points in all. Nothing changes.
    const en = [half(150, 380), half(120, 310)] as const;
    expect(guessNameLine(en, 700)).toBeNull();
    expect(run(en, 700)).toMatchObject({ line: null, done: true });
    // Vietnamese chips wrap taller: 820 of 700. Both names end at one line height, the largest
    // that fits.
    const vi = [half(150, 430), half(120, 390)] as const;
    const found = run(vi, 700);
    expect(found.done).toBe(true);
    const [a, b] = scalesAt(vi, found.line);
    expect(150 * a).toBeCloseTo(120 * b, 3);
    expect(totalAt(vi, found.line)).toBeLessThanOrEqual(700);
    expect(totalAt(vi, (found.line ?? 0) + 3)).toBeGreaterThan(700);
    // Nothing fits unless a word breaks: the names stop at the smallest size that keeps them
    // whole, and the rest scrolls.
    const crowded = [half(150, 900), half(120, 900)] as const;
    const whole = run(crowded, 700, 60);
    expect(whole.done).toBe(true);
    expect(whole.line).toBeGreaterThanOrEqual(60);
    expect(whole.line).toBeLessThanOrEqual(65);
    // A split word is told apart from a many-word name wrapping at its spaces.
    expect(splitsWord('Chefchaouen', 'en', ['CHEFCHA', 'OUEN'])).toBe(true);
    expect(splitsWord('Thành phố Hồ Chí Minh', 'vi', ['THÀNH PHỐ', 'HỒ CHÍ MINH'])).toBe(false);
  });

  it('sends the showdown on to the reveal once the poll closes', async () => {
    const s = await open();
    await seedClosed(s, [{ userId: MAYA, optionId: OPT_KYOTO }], MAYA);
    await renderVote(<Final me={s.uid} view="showdown" />, s);
    await until(() => (router.replace as jest.Mock).mock.calls.length > 0);
    expect(router.replace).toHaveBeenCalledWith(voteRoutes.reveal(POLL));
  });
});

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
    await until(() => screen.queryByTestId('winner-reveal') !== null);
    expect(screen.getByText('WINS 2–1')).toBeTruthy();
    expect(screen.getByTestId('reveal-set-up')).toBeTruthy();
    expect(screen.queryByTestId('reveal-lost')).toBeNull();
    await until(() => screen.queryByTestId('reveal-stamp') !== null);
    expect(await queued(s, 'mark_reveal_seen')).toEqual([{ poll_id: POLL }]);
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
    await until(() => screen.queryByTestId('reveal-setup-with') !== null);
    expect(screen.getByTestId('reveal-setup-with')).toHaveTextContent('Setup is with Maya.');
    expect(screen.getByTestId('reveal-lost')).toBeTruthy();
    expect(screen.queryByTestId('reveal-set-up')).toBeNull();
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
