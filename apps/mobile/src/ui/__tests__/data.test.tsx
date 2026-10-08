// Skia's native renderer does not exist under Jest; see test-support/skia-double for the stand-in.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('../test-support/skia-double'));

import { act, renderHook, screen } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { tokens } from '@cp/design-tokens';

import { useMotionMode } from '@/motion/motion-mode';
import { resetMotionModeForTests } from '@/motion/test-support/reset-motion-mode';

import { BalanceBars } from '../data/BalanceBars';
import { CountUp } from '../data/CountUp';
import { DayBarsVsPlan } from '../data/DayBarsVsPlan';
import { Donut } from '../data/Donut';
import { MonthBars } from '../data/MonthBars';
import { PollBars } from '../data/PollBars';
import { ProgressRing } from '../data/ProgressRing';
import { renderUi } from '../test-support/render';

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
    expect(screen.getByLabelText('Maya is owed +41.00; Rin owes −41.00')).toBeTruthy();
    expect(screen.getByLabelText('By day; Mon $900 today over plan')).toBeTruthy();
    expect(
      screen.getByLabelText('Kyoto, 3 votes, 75%, your vote; Lisbon, 1 vote, 25%'),
    ).toBeTruthy();
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
