/**
 * The recap story over the real local-first stack and a channel at the realtime boundary: opening
 * it records the open (which signs the crew's stamps) once, a crewmate's signature arriving on the
 * recap's channel writes itself on the stamp card, VOTE FOR THE MVP queues the vote for the chosen
 * award, the sound switch stops and starts the music, and the story's end is counted once per
 * session and rests on the last card until the traveller closes it into the recap page.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('@/ui/sticker/Sticker', () => require('@/ui/avatar/test-support/sticker-double'));
jest.mock('@/motion/use-loop', () => ({ useLoop: () => ({}) }));
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: {
    push: jest.fn(),
    navigate: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useLocalSearchParams: jest.fn(() => ({})),
}));

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { music } from '@/motion/music';

import { MAYA, RECAP, recapRow, TRIP } from '../../dev/recap-fixtures';
import {
  fakeRealtime,
  queued,
  recordingAnalytics,
  renderRecap,
  seedAwards,
  seedRecap,
  seedStamp,
  seedTrip,
  until,
} from '../../test-support/recap-harness';
import { RecapStoryScreen } from '../story-screen';
import { storySession } from '../story-session';

let stack: TestLocalFirst | null = null;

async function open(): Promise<TestLocalFirst> {
  stack = await openTestLocalFirst({ holdUploads: true });
  await seedTrip(stack);
  await seedRecap(stack, recapRow());
  await seedAwards(stack);
  await seedStamp(stack);
  return stack;
}

const player = () => screen.getByTestId('recap-story-player');
const slide = () => screen.getByRole('adjustable');
const next = () =>
  fireEvent(slide(), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });

async function skipTo(testID: string): Promise<void> {
  for (let step = 0; step < 8 && screen.queryByTestId(testID) === null; step += 1) await next();
  await until(() => screen.queryByTestId(testID) !== null);
}

async function untilQueued(s: TestLocalFirst, cmd: string, count: number): Promise<void> {
  const deadline = Date.now() + 15_000;
  while ((await queued(s, cmd)).length < count) {
    if (Date.now() > deadline) throw new Error(`${cmd} was not queued`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

afterEach(async () => {
  (router.replace as jest.Mock).mockClear();
  storySession.reset();
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

describe('recap story', () => {
  it('records the open once, and counts the end once before settling into the page', async () => {
    const s = await open();
    const analytics = recordingAnalytics();
    await renderRecap(<RecapStoryScreen tripId={TRIP} />, s, { analytics: analytics.client });
    await until(() => screen.queryByTestId('recap-card-cover') !== null);
    expect(player()).toBeTruthy();
    await untilQueued(s, 'record_recap_view', 1);
    expect(await queued(s, 'record_recap_view')).toEqual([{ recap_id: RECAP, kind: 'open' }]);
    // Opening is not finishing.
    expect(analytics.captured).not.toContain('recap_story_completed');

    // Played past its last card, the story counts as watched and stays where it is.
    for (let step = 0; step < 10; step += 1) await next();
    expect(analytics.captured.filter((event) => event === 'recap_story_completed')).toHaveLength(1);
    expect(router.replace).not.toHaveBeenCalled();
    expect(player()).toBeTruthy();

    // Closing it is the traveller's move, and counts nothing twice.
    await fireEvent.press(screen.getByTestId('recap-story-close'));
    await fireEvent.press(screen.getByTestId('recap-story-close'));
    expect(analytics.captured.filter((event) => event === 'recap_story_completed')).toHaveLength(1);
    await untilQueued(s, 'record_recap_view', 2);
    expect(await queued(s, 'record_recap_view')).toEqual([
      { recap_id: RECAP, kind: 'open' },
      { recap_id: RECAP, kind: 'complete' },
    ]);
    expect(router.replace).toHaveBeenLastCalledWith({
      pathname: '/recap/[tripId]',
      params: { tripId: TRIP, ended: '1' },
    });
  });

  it('switches the music off and on with the sound switch, and shows which it is', async () => {
    const s = await open();
    const start = jest.spyOn(music, 'crossfadeTo');
    const stop = jest.spyOn(music, 'stop');
    await renderRecap(<RecapStoryScreen tripId={TRIP} />, s);
    await until(() => screen.queryByTestId('recap-card-cover') !== null);
    expect(start).toHaveBeenCalled();
    start.mockClear();
    stop.mockClear();

    await fireEvent.press(screen.getByTestId('recap-story-sound-on'));
    expect(screen.getByTestId('recap-story-sound-off')).toBeTruthy();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('recap-story-sound-off'));
    expect(screen.getByTestId('recap-story-sound-on')).toBeTruthy();
    expect(start).toHaveBeenCalledTimes(1);
    start.mockRestore();
    stop.mockRestore();
  });

  it("writes a crewmate's signature on the stamp as it arrives on the recap's channel", async () => {
    const s = await open();
    const realtime = fakeRealtime();
    await renderRecap(<RecapStoryScreen tripId={TRIP} />, s, { realtime: realtime.client });
    await until(() => realtime.subscribed(`recap:${RECAP}`));
    await skipTo('recap-card-stamp');
    expect(screen.queryByTestId(`recap-signature-${MAYA}`)).toBeNull();

    realtime.emit(`recap:${RECAP}`, 'signature', {
      signer_id: MAYA,
      stroke_media_key: null,
      signed_at: '2026-10-05T01:00:00Z',
    });
    await until(() => screen.queryByLabelText('Maya') !== null);
    expect(screen.getByTestId(`recap-signature-${MAYA}`)).toHaveTextContent('Maya');
  });

  it('queues the MVP vote for the award picked on the awards card', async () => {
    const s = await open();
    await renderRecap(<RecapStoryScreen tripId={TRIP} />, s);
    await until(() => screen.queryByTestId('recap-card-cover') !== null);
    await skipTo('recap-card-awards');
    await fireEvent.press(screen.getByTestId('recap-story-vote'));
    await until(
      () => screen.queryByTestId('recap-mvp-0192f000-0000-7000-8000-00000000aa02') !== null,
    );
    await fireEvent.press(screen.getByTestId('recap-mvp-0192f000-0000-7000-8000-00000000aa02'));
    await untilQueued(s, 'cast_mvp_vote', 1);
    expect(await queued(s, 'cast_mvp_vote')).toEqual([
      { recap_id: RECAP, award_id: '0192f000-0000-7000-8000-00000000aa02' },
    ]);
  });
});
