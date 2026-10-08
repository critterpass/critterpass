jest.mock('../../feedback', () => ({ impact: jest.fn() }));

import { act, renderHook } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo } from 'react-native';

import { impact } from '../../feedback';
import { useMotionMode } from '../../motion-mode';
import { resetMotionModeForTests } from '../../test-support/reset-motion-mode';
import { useBarGrow } from '../bar-grow';
import { useCountUp } from '../count-up';
import { useOdometer } from '../odometer';
import { useSplitFlapCharacter } from '../split-flap';
import { useStoryProgress } from '../story-progress';
import { useTypewriter } from '../typewriter';

const mockedImpact = impact as jest.MockedFunction<typeof impact>;

beforeEach(async () => {
  mockedImpact.mockClear();
  await resetMotionModeForTests();
});

describe('useOdometer', () => {
  it('renders one column per digit, least-significant last', async () => {
    const { result } = await renderHook(() => useOdometer(42));
    expect(result.current.columns.map((column) => column.key)).toEqual(['digit1', 'digit0']);
    expect(result.current.columns.map((column) => column.value.value)).toEqual([4, 2]);
  });

  it('grows a new column when the digit count increases, rolling it in from 0', async () => {
    const { result, rerender } = await renderHook(
      ({ value }: { value: number }) => useOdometer(value),
      {
        initialProps: { value: 9 },
      },
    );
    expect(result.current.columns).toHaveLength(1);
    await rerender({ value: 10 });
    expect(result.current.columns.map((column) => column.key)).toEqual(['digit1', 'digit0']);
    expect(result.current.columns.map((column) => column.value.value)).toEqual([1, 0]);
  });

  it('shows a sign column for negative values and drops it once positive again', async () => {
    const { result, rerender } = await renderHook(
      ({ value }: { value: number }) => useOdometer(value),
      {
        initialProps: { value: -5 },
      },
    );
    expect(result.current.columns[0]?.isSign).toBe(true);
    await rerender({ value: 5 });
    expect(result.current.columns.every((column) => !column.isSign)).toBe(true);
  });

  it('fires the tick cue while rolling', async () => {
    await renderHook(() => useOdometer(7));
    expect(mockedImpact).toHaveBeenCalledWith('tick');
  });

  it('reduced motion: jumps straight to the target digits with no tick', async () => {
    const { result: modeResult, rerender: modeRerender } = await renderHook(() => useMotionMode());
    await act(() => {
      modeResult.current[1]('reduced');
    });
    await modeRerender(undefined);

    const { result, rerender } = await renderHook(
      ({ value }: { value: number }) => useOdometer(value),
      {
        initialProps: { value: 1 },
      },
    );
    mockedImpact.mockClear();
    await rerender({ value: 20 });
    expect(result.current.columns.map((column) => column.value.value)).toEqual([2, 0]);
    expect(mockedImpact).not.toHaveBeenCalled();
  });
});

describe('useCountUp', () => {
  it('settles at the target value', async () => {
    const { result, rerender } = await renderHook(
      ({ target }: { target: number }) => useCountUp(target),
      {
        initialProps: { target: 10 },
      },
    );
    expect(result.current.value.value).toBe(10);
    await rerender({ target: 25 });
    expect(result.current.value.value).toBe(25);
  });
});

describe('useBarGrow', () => {
  it('grows to the target fraction', async () => {
    const { result, rerender } = await renderHook(() =>
      useBarGrow({ active: true, toValue: 0.75 }),
    );
    await rerender(undefined);
    const style = result.current as unknown as { transform: ReadonlyArray<{ scaleX?: number }> };
    expect(style.transform.find((entry) => 'scaleX' in entry)?.scaleX).toBe(0.75);
  });
});

describe('useSplitFlapCharacter', () => {
  it('swaps the display character once the flip settles', async () => {
    const { result, rerender } = await renderHook(
      ({ char }: { char: string }) => useSplitFlapCharacter(char),
      {
        initialProps: { char: 'A' },
      },
    );
    expect(result.current.displayChar).toBe('A');
    await rerender({ char: 'B' });
    expect(result.current.displayChar).toBe('B');
    expect(mockedImpact).toHaveBeenCalledWith('flap');
  });
});

describe('useTypewriter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('reveals one word at a time', async () => {
    const { result } = await renderHook(() =>
      useTypewriter({ text: 'one two three', wordsPerSecond: 10 }),
    );
    expect(result.current.visibleText).toBe('');
    expect(result.current.fullText).toBe('one two three');

    await act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(result.current.visibleText).toBe('one ');

    await act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(result.current.visibleText).toBe('one two three');
    expect(result.current.isRevealing).toBe(false);
  });

  it('continues from where it left off when text grows (stream mode)', async () => {
    const { result, rerender } = await renderHook(
      ({ text }: { text: string }) => useTypewriter({ text, wordsPerSecond: 10 }),
      {
        initialProps: { text: 'one' },
      },
    );
    await act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(result.current.visibleText).toBe('one');

    await rerender({ text: 'one two' });
    await act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(result.current.visibleText).toBe('one two');
  });

  it('stops its timer with the last word and starts it again when more text arrives', async () => {
    const { result, rerender } = await renderHook(
      ({ text }: { text: string }) => useTypewriter({ text, wordsPerSecond: 10 }),
      { initialProps: { text: 'one two' } },
    );
    const started = jest.spyOn(globalThis, 'setInterval');
    const stopped = jest.spyOn(globalThis, 'clearInterval');
    await act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(result.current.visibleText).toBe('one two');
    expect(stopped).toHaveBeenCalledTimes(1);

    // Whole text on the page: nothing ticks, however long it stays there.
    const before = jest.getTimerCount();
    await act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(jest.getTimerCount()).toBeLessThanOrEqual(before);
    expect(started).not.toHaveBeenCalled();

    await rerender({ text: 'one two three' });
    expect(started).toHaveBeenCalledTimes(1);
    await act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(result.current.visibleText).toBe('one two three');
    expect(result.current.isRevealing).toBe(false);
  });

  it('starts no timer for text that is not being revealed', async () => {
    const started = jest.spyOn(globalThis, 'setInterval');
    const saved = await renderHook(() =>
      useTypewriter({ text: 'a saved answer, already whole', enabled: false }),
    );
    expect(saved.result.current.visibleText).toBe('a saved answer, already whole');
    expect(saved.result.current.isRevealing).toBe(false);
    const empty = await renderHook(() => useTypewriter({ text: '' }));
    expect(empty.result.current.visibleText).toBe('');
    expect(started).not.toHaveBeenCalled();
  });

  it('shows the full text immediately under reduced motion', async () => {
    const { result: modeResult, rerender: modeRerender } = await renderHook(() => useMotionMode());
    await act(() => {
      modeResult.current[1]('reduced');
    });
    await modeRerender(undefined);

    const { result } = await renderHook(() => useTypewriter({ text: 'fully visible now' }));
    expect(result.current.visibleText).toBe('fully visible now');
    expect(result.current.isRevealing).toBe(false);
  });
});

describe('useStoryProgress', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reaches full progress and calls onComplete after 5 seconds', async () => {
    const onComplete = jest.fn();
    const { result } = await renderHook(() => useStoryProgress({ active: true, onComplete }));
    expect(onComplete).not.toHaveBeenCalled();
    await act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(result.current.progress.value).toBe(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('pauses without losing progress and resumes for the remaining time', async () => {
    const onComplete = jest.fn();
    const { result, rerender } = await renderHook(
      ({ paused }: { paused: boolean }) => useStoryProgress({ active: true, paused, onComplete }),
      { initialProps: { paused: false } },
    );
    await act(() => {
      jest.advanceTimersByTime(2000);
    });
    await rerender({ paused: true });
    const progressWhilePaused = result.current.progress.value;
    await act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(result.current.progress.value).toBe(progressWhilePaused);
    expect(onComplete).not.toHaveBeenCalled();

    await rerender({ paused: false });
    await act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('announces completion for screen readers', async () => {
    const announceSpy = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined);
    await renderHook(() =>
      useStoryProgress({ active: true, completionAnnouncement: 'Next story' }),
    );
    await act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(announceSpy).toHaveBeenCalledWith('Next story');
    announceSpy.mockRestore();
  });
});
