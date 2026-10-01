// Skia's native renderer does not exist under Jest; see ui/avatar/test-support/skia-double for the stand-in.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/avatar/test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('@/ui/sticker/Sticker', () => require('@/ui/avatar/test-support/sticker-double'));

/**
 * The launch hatch never gets in the way: the full hatch plays once, on the first launch only; later
 * cold starts get the short beat, which never takes a touch, holds until the launch screen goes,
 * then unmounts. (Routing under the beat: ./launch-hatch-routing.test.tsx.)
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { Platform, Pressable, Text } from 'react-native';
import { createMMKV } from 'react-native-mmkv';

import { renderUi } from '@/ui/test-support/render';

import { LaunchHatch } from '../LaunchHatch';
import {
  HATCHED_KEY,
  finishLaunchHatch,
  launchHatchKind,
  launchHatchPending,
  markSplashRevealed,
  resetLaunchStateForTests,
} from '../launch-state';
import { BEAT_PLAN, settleMs } from '../timeline';

const storage = createMMKV({ id: 'launch-hatch-test' });

/** A fresh JS runtime (a cold start) over the same device storage. */
function coldStart({ hatched }: { hatched: boolean }) {
  storage.clearAll();
  if (hatched) storage.set(HATCHED_KEY, true);
  resetLaunchStateForTests(storage);
}

const queryBeat = () => screen.queryByTestId('launch-hatch-beat', { includeHiddenElements: true });

let taps = 0;

function TripDay() {
  return (
    <Pressable accessibilityRole="button" onPress={() => (taps += 1)}>
      <Text>trip day</Text>
    </Pressable>
  );
}

function App({ revealed }: { readonly revealed: boolean }) {
  return (
    <>
      <TripDay />
      <LaunchHatch revealed={revealed} />
    </>
  );
}

const BEAT_TOTAL_MS = BEAT_PLAN.playMs + BEAT_PLAN.holdMs + BEAT_PLAN.fadeMs;

/**
 * Moves the beat's clock on. It runs on JS timers (a settle wait once the launch screen has gone,
 * then one for the play and the fade), so the beat is driven by the fake clock rather than by how
 * fast a busy runner gets round to its timers and renders.
 */
async function elapse(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}

beforeEach(() => {
  taps = 0;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('which hatch a cold start plays', () => {
  it('plays the full hatch on the first launch only, and the beat on every later one', () => {
    coldStart({ hatched: false });
    expect(launchHatchKind()).toBe('full');
    expect(launchHatchPending('beat')).toBe(false);
    expect(launchHatchPending('full')).toBe(true);
    finishLaunchHatch('full');
    // The welcome screen coming back later in the same run never replays it.
    expect(launchHatchPending('full')).toBe(false);
    expect(storage.getBoolean(HATCHED_KEY)).toBe(true);

    resetLaunchStateForTests(storage);
    expect(launchHatchKind()).toBe('beat');
    expect(launchHatchPending('full')).toBe(false);
    expect(launchHatchPending('beat')).toBe(true);
    finishLaunchHatch('beat');
    expect(launchHatchPending('beat')).toBe(false);
  });
});

describe('the later-launch beat', () => {
  it('stays off the first launch, which the welcome screen hatches instead', async () => {
    coldStart({ hatched: false });
    await renderUi(<App revealed />);
    expect(queryBeat()).toBeNull();
  });

  it('never takes a touch, holds until the launch screen goes, then unmounts', async () => {
    jest.useFakeTimers();
    coldStart({ hatched: true });
    await renderUi(<App revealed={false} />);
    const beat = screen.getByTestId('launch-hatch-beat', { includeHiddenElements: true });
    expect(beat.props.pointerEvents).toBe('none');
    expect(beat.props.importantForAccessibility).toBe('no-hide-descendants');

    await fireEvent.press(screen.getByRole('button'));
    expect(taps).toBe(1);

    // However long the native launch screen stays up, the beat waits for it.
    await elapse(BEAT_TOTAL_MS * 10);
    expect(queryBeat()).not.toBeNull();

    // What the root's `revealed` prop does once the native launch screen hides.
    await act(() => markSplashRevealed());
    await elapse(settleMs(Platform.OS));
    await elapse(BEAT_TOTAL_MS - 1);
    expect(queryBeat()).not.toBeNull();
    await elapse(1);
    expect(queryBeat()).toBeNull();
  });

  it('plays once per cold start: a resume does not replay it', async () => {
    jest.useFakeTimers();
    coldStart({ hatched: true });
    const first = await renderUi(<App revealed />);
    expect(queryBeat()).not.toBeNull();
    await elapse(settleMs(Platform.OS));
    await elapse(BEAT_TOTAL_MS);
    expect(queryBeat()).toBeNull();
    await first.unmount();
    await renderUi(<App revealed />);
    expect(queryBeat()).toBeNull();
  });
});
