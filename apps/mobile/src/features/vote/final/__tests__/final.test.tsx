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
import { nameCap } from '../showdown-name-fit';
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

  it("sets a half's name smaller when its content runs past its share of the screen", async () => {
    const s = await open();
    await seedFinal(s, [{ userId: MAYA, optionId: OPT_KYOTO }]);
    await renderVote(<Final me={s.uid} view="showdown" />, s);
    await until(() => screen.queryByText('LISBON') !== null);
    const layout = (y: number, width: number, height: number) => ({
      nativeEvent: { layout: { x: 0, y, width, height } },
    });
    const nameWidth = (index: number) =>
      StyleSheet.flatten(
        screen.getByTestId(`showdown-name-${index}`).props.style as StyleProp<ViewStyle>,
      )?.width;
    const lines = (width: number) => ({ nativeEvent: { lines: [{ width, text: 'KYOTO' }] } });
    await fireEvent(screen.getByTestId('showdown-body'), 'layout', layout(0, 360, 700));
    for (const index of [0, 1]) {
      await fireEvent(screen.getByTestId(`showdown-name-${index}`), 'layout', layout(0, 300, 120));
      await fireEvent(screen.getByTestId(`showdown-name-${index}`), 'textLayout', lines(280));
    }
    // Both halves fit their share: the names keep their designed size.
    await fireEvent(screen.getByTestId('showdown-votes-0'), 'layout', layout(200, 300, 30));
    await fireEvent(screen.getByTestId('showdown-votes-1'), 'layout', layout(250, 300, 30));
    expect(nameWidth(0)).toBeUndefined();
    expect(nameWidth(1)).toBeUndefined();
    // The lower half's chips wrap taller: its name gives up the difference, the other keeps its size.
    await fireEvent(screen.getByTestId('showdown-votes-1'), 'layout', layout(400, 300, 30));
    const capped = nameWidth(1);
    expect(capped).toBeLessThan(280);
    expect(nameWidth(0)).toBeUndefined();
    // Set smaller, the name is shorter and the half fits: the box stays put instead of narrowing on.
    await fireEvent(screen.getByTestId('showdown-name-1'), 'layout', layout(0, 200, 76));
    await fireEvent(screen.getByTestId('showdown-votes-1'), 'layout', layout(356, 300, 30));
    expect(nameWidth(1)).toBe(capped);
  });

  it('scales a name from its designed size, never below the floor share', () => {
    // One line set at 150 pt (120 tall), 300 wide.
    const fit = { key: 'k', cap: null, height: 120, width: 300, lines: 1 };
    expect(nameCap(fit, 120, 0)).toBeNull();
    expect(nameCap(fit, 120, 30)).toBeCloseTo(225);
    // Already shed 30 of the 30 needed: the same box, not a narrower one.
    expect(nameCap(fit, 90, 0)).toBeCloseTo(225);
    // A crowded half stops at the floor share of its designed width.
    expect(nameCap(fit, 120, 500)).toBeCloseTo(135);
    // A long word set small already stops where it still fits whole at the floor size.
    const long = { key: 'k', cap: null, height: 60, width: 340, lines: 1 };
    expect(nameCap(long, 60, 500)).toBeCloseTo(340 * (44 / 75) * 1.15);
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
