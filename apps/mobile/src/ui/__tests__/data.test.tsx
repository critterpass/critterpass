import { act, fireEvent, renderHook, screen } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo, StyleSheet } from 'react-native';

import { tokens } from '@cp/design-tokens';

import { useMotionMode } from '@/motion/motion-mode';
import { resetMotionModeForTests } from '@/motion/test-support/reset-motion-mode';

import { BalanceBars } from '../data/BalanceBars';
import { CalendarHeatmap } from '../data/CalendarHeatmap';
import { Countdown, spokenDuration, splitDuration } from '../data/Countdown';
import { CountUp } from '../data/CountUp';
import { DayBarsVsPlan } from '../data/DayBarsVsPlan';
import { Donut } from '../data/Donut';
import { HourlyCrowd } from '../data/HourlyCrowd';
import { MonthBars } from '../data/MonthBars';
import { PollBars } from '../data/PollBars';
import { ProgressRing } from '../data/ProgressRing';
import { StreamText } from '../data/StreamText';
import { WeatherStrip } from '../data/WeatherStrip';
import { renderUi } from '../test-support/render';

const colorOf = (node: { props: { style?: unknown } }) =>
  (StyleSheet.flatten(node.props.style as never) as { color?: string } | undefined)?.color;

beforeEach(async () => {
  await resetMotionModeForTests();
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

describe('chart text summaries', () => {
  it('summarises every donut segment with its share', async () => {
    await renderUi(
      <Donut
        title="Spent"
        segments={[
          { label: 'Stays', value: 3, color: tokens.color.blue },
          { label: 'Food', value: 1, color: tokens.color.pink },
        ]}
      />,
    );
    expect(screen.getByRole('image', { name: 'Spent: Stays 75% and Food 25%' })).toBeTruthy();
    const arcs = screen.getAllByTestId('skia-path', { includeHiddenElements: true });
    const ends = arcs.slice(1).map((arc) => (arc.props.skiaProps as { end: number }).end);
    expect(ends).toEqual([0.75, 1]);
  });

  it('gives each chart a spoken summary built from its data', async () => {
    await renderUi(
      <>
        <ProgressRing progress={0.4} />
        <MonthBars
          title="Best time to go"
          months={[
            { label: 'Apr', value: 1, highlight: true },
            { label: 'May', value: 0.5 },
          ]}
        />
        <HourlyCrowd
          title="Crowds"
          hours={[
            { hour: 6, level: 0.1 },
            { hour: 11, level: 0.9 },
          ]}
        />
        <BalanceBars
          owesHeading="Owes"
          owedHeading="Is owed"
          balances={[
            { name: 'Maya', direction: 'owed', fraction: 1, amountLabel: '+41.00' },
            { name: 'Rin', direction: 'owes', fraction: 1, amountLabel: '−41.00' },
          ]}
        />
        <DayBarsVsPlan
          title="By day"
          days={[{ label: 'Mon', actual: 0.9, plan: 0.5, amountLabel: '$900', today: true }]}
        />
        <WeatherStrip days={[{ day: 'Fri', place: 'Boat', temperature: '28°', rain: 0.7 }]} />
        <PollBars
          options={[
            { label: 'Kyoto', votes: 3, mine: true },
            { label: 'Lisbon', votes: 1 },
          ]}
        />
      </>,
    );
    expect(screen.getByRole('progressbar', { name: '40%' })).toBeTruthy();
    expect(screen.getByLabelText('Best time to go: best in Apr')).toBeTruthy();
    expect(screen.getByLabelText('Crowds, quietest at 6 AM, busiest at 11 AM')).toBeTruthy();
    expect(screen.getByLabelText('Maya is owed +41.00; Rin owes −41.00')).toBeTruthy();
    expect(screen.getByLabelText('By day; Mon $900 today over plan')).toBeTruthy();
    expect(screen.getByLabelText('Fri Boat: 28°, 70% chance of rain')).toBeTruthy();
    expect(
      screen.getByLabelText('Kyoto, 3 votes, 75%, your vote; Lisbon, 1 vote, 25%'),
    ).toBeTruthy();
  });

  it('labels each heatmap day when days are selectable', async () => {
    const onSelectDay = jest.fn();
    await renderUi(
      <CalendarHeatmap
        title="April 2027"
        weekdays={['M', 'T', 'W', 'T', 'F', 'S', 'S']}
        leadingBlanks={3}
        total={6}
        range={{ from: 2, to: 3 }}
        rangeLabel="Apr 2–3"
        days={[
          { day: 1, free: 4 },
          { day: 2, free: 6 },
        ]}
        onSelectDay={onSelectDay}
      />,
    );
    expect(screen.getByRole('header', { name: 'April 2027, Apr 2–3' })).toBeTruthy();
    const day2 = screen.getByRole('button', { name: '2: 6 of 6 free' });
    expect(day2.props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent(day2, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    expect(onSelectDay).toHaveBeenCalledWith(2);
  });
});

describe('Countdown', () => {
  it('splits and speaks durations in the requested units', () => {
    expect(splitDuration(90_061_000, 'dhms')).toEqual([
      ['day', 1],
      ['hour', 1],
      ['minute', 1],
      ['second', 1],
    ]);
    expect(splitDuration(3_725_000, 'ms')).toEqual([
      ['minute', 62],
      ['second', 5],
    ]);
    expect(spokenDuration('en', 7_805_000, 'dhms')).toBe('2 hours, 10 minutes, 5 seconds');
  });

  it('changes its label together with its colour when it turns urgent, and announces it', async () => {
    jest.useFakeTimers({ now: new Date('2026-09-27T10:00:00Z') });
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await renderUi(
      <Countdown
        target={new Date('2026-09-27T10:01:05Z')}
        units="ms"
        label="Leave by"
        urgentLabel="Leave now"
        urgentBelowMs={60_000}
        announceEveryMs={600_000}
      />,
    );
    expect(screen.getByRole('timer').props.accessibilityLabel).toBe(
      'Leave by, 1 minute, 5 seconds',
    );
    const calm = screen.getByText('LEAVE BY', { includeHiddenElements: true });
    expect(colorOf(calm)).not.toBe(tokens.semantic.state.warning);

    await act(() => jest.advanceTimersByTime(6000));
    expect(screen.getByRole('timer').props.accessibilityLabel).toBe('Leave now, 59 seconds');
    const urgent = screen.getByText('LEAVE NOW', { includeHiddenElements: true });
    expect(colorOf(urgent)).toBe(tokens.semantic.state.warning);
    expect(announce).toHaveBeenCalledWith('Leave now, 59 seconds');
  });

  it('announces on its interval and fires onElapsed once at zero', async () => {
    jest.useFakeTimers({ now: new Date('2026-09-27T10:00:00Z') });
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const onElapsed = jest.fn();
    await renderUi(
      <Countdown
        target={new Date('2026-09-27T10:00:03Z')}
        units="ms"
        announceEveryMs={2000}
        onElapsed={onElapsed}
      />,
    );
    await act(() => jest.advanceTimersByTime(2000));
    expect(announce).toHaveBeenCalledWith('1 second');
    await act(() => jest.advanceTimersByTime(3000));
    expect(onElapsed).toHaveBeenCalledTimes(1);
  });
});

describe('numbers', () => {
  it('counts up to the final value and speaks it immediately', async () => {
    jest.useFakeTimers();
    await renderUi(<CountUp value={1280} accessibilityLabel="Steps" />);
    expect(screen.getByLabelText('Steps, 1,280')).toBeTruthy();
    await act(() => jest.advanceTimersByTime(1000));
    expect(screen.getByText('1,280')).toBeTruthy();
  });

  it('shows the final number at once under reduced motion', async () => {
    const { result } = await renderHook(() => useMotionMode());
    await act(() => result.current[1]('reduced'));
    await renderUi(<CountUp value={42} />);
    expect(screen.getByText('42')).toBeTruthy();
  });
});

describe('StreamText', () => {
  it('reserves the final box, reveals word by word and announces once when complete', async () => {
    jest.useFakeTimers();
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const text = 'Keep going past the viewpoint.';
    await renderUi(<StreamText text={text} wordsPerSecond={10} />);
    const box = screen.getByRole('text', { name: text });
    expect(box.props.accessibilityState).toEqual({ busy: true });
    expect(screen.getAllByText(text, { includeHiddenElements: true })).toHaveLength(1);
    expect(announce).not.toHaveBeenCalled();

    await act(() => jest.advanceTimersByTime(1000));
    expect(screen.getAllByText(text, { includeHiddenElements: true })).toHaveLength(2);
    expect(screen.getByRole('text', { name: text }).props.accessibilityState).toEqual({
      busy: false,
    });
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(text);
  });

  it('stays busy while a stream is still arriving', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await renderUi(<StreamText text="Pon is" complete={false} />);
    expect(screen.getByRole('text', { name: 'Pon is' }).props.accessibilityState).toEqual({
      busy: true,
    });
    expect(announce).not.toHaveBeenCalled();
  });
});
