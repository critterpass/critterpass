/**
 * The storm screen: only a member on the vote can vote, a vote is sent once for the option picked,
 * the count names the leading option, and after the decision the booked seat's state is told
 * truthfully (only the original booker gets Confirm & pay; nobody is told seats moved before the
 * new booking is confirmed).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('@/ui/sticker/Sticker', () => require('@/ui/avatar/test-support/sticker-double'));
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false },
}));

import { describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScreenJoltProvider } from '@/motion/patterns/thud';

import { STORM_SCENES } from '../dev/storm-scenes';
import { optionTitle, weekdayName } from '../copy';
import { stormModel, type StormOptionData } from '../model';
import { StormView } from '../storm-view';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

async function show(node: ReactNode) {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  return await render(
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <GestureHandlerRootView>
          <ScreenJoltProvider>{node}</ScreenJoltProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nProvider>,
  );
}
const scene = (name: string) => show((STORM_SCENES[name] as () => ReactNode)());
type ViewProps = Parameters<typeof StormView>[0];
/** A scene's StormView props (the scene wraps the view to read the guide's words). */
const propsOf = (name: string): ViewProps => {
  const scene = (
    STORM_SCENES[name] as () => ReactElement<{
      children: (title: string, line: string) => ReactElement<ViewProps>;
    }>
  )();
  return scene.props.children('Rough seas Friday', 'Saturday is flat calm.').props;
};

describe('storm screen', () => {
  it('shows the numbers, the options and the count, and sends the option picked', async () => {
    const onVote = jest.fn();
    await show(<StormView {...propsOf('3k-8')} onVote={onVote} />);
    expect(screen.getByText('ROUGH SEAS FRIDAY')).toBeTruthy();
    expect(screen.getByText('WAVES 2.5M')).toBeTruthy();
    expect(screen.getByText('SWAP FRIDAY AND SATURDAY')).toBeTruthy();
    expect(screen.getByText('4 of 6 said swap friday and saturday.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('storm-option-skip'));
    await fireEvent.press(screen.getByTestId('storm-vote'));
    expect(onVote).toHaveBeenCalledWith('skip');
  });

  it('does not send the same vote twice, and offers no vote to a member not on it', async () => {
    const onVote = jest.fn();
    await show(<StormView {...propsOf('3k-8-voted')} onVote={onVote} />);
    await fireEvent.press(screen.getByTestId('storm-vote'));
    expect(onVote).not.toHaveBeenCalled();
    await scene('3k-8-not-voting');
    expect(screen.getAllByTestId('storm-not-voting').length).toBeGreaterThan(0);
  });

  it('gives Confirm & pay to the original booker only, and never says moved before it is', async () => {
    await scene('3k-8-booker-pay');
    expect(screen.getByTestId('storm-confirm-pay')).toBeTruthy();
    expect(screen.queryByText(/old booking is cancelled\.$/u)).toBeNull();
  });

  it('tells the others they wait on the booker', async () => {
    await scene('3k-8-waiting-on-booker');
    expect(screen.queryByTestId('storm-confirm-pay')).toBeNull();
    expect(screen.getByText('Waiting on Maya to confirm and pay for Saturday.')).toBeTruthy();
  });

  it('keeps the old booking when the new seats were not confirmed', async () => {
    await scene('3k-8-seats-not-confirmed');
    expect(
      screen.getByText("Seats for Saturday weren't confirmed. The old booking is kept."),
    ).toBeTruthy();
  });
});

describe('stormModel', () => {
  it('keeps the plan when the vote closed with no choice, and ignores ballots for unknown options', () => {
    const model = stormModel(
      {
        id: 'penida-storm',
        trip_id: 'bali-trip',
        status: 'resolved',
        cause: 'rough_seas',
        title: '',
        summary: '',
        facts: '{broken',
        options: JSON.stringify([{ id: 'keep', poll_option_id: 'k', facts: {} }, { id: 'fly' }]),
        source_snapshot: null,
        chosen_option_id: null,
        i18n: null,
      },
      {
        id: 'p',
        status: 'closed',
        eligible_voter_ids: '["a"]',
        closes_at: null,
        winner_option_id: null,
      },
      [{ user_id: 'a', option_id: 'gone' }],
      'a',
    );
    expect(model).toMatchObject({ phase: 'decided', chosen: 'keep', canVote: false, myVote: null });
    expect(model.options.map((o) => o.id)).toEqual(['keep']);
    expect(model.tally).toEqual([]);
  });
});

describe('storm weekdays', () => {
  const swap: StormOptionData = {
    id: 'swap',
    label: 'Swap Friday and Saturday',
    recommended: true,
    per_person_minor: 0,
    currency: 'USD',
    supplier: 'none',
    facts: { title: 'Nusa Penida boat', from: 'Friday', to: 'Saturday' },
    note: null,
    poll_option_id: 'option-swap',
    swap_day: '2026-10-17',
    storm_day: '2026-10-16',
  };

  it('names the days in the reader language from their dates, not the planner English labels', () => {
    expect(weekdayName('2026-10-16', 'Friday', 'vi')).toBe('Thứ Sáu');
    expect(weekdayName('2026-10-17', 'Saturday', 'en')).toBe('Saturday');
    i18n.loadAndActivate({ locale: 'vi', messages: {} });
    const title = optionTitle(swap, 'vi');
    expect(title).toContain('THỨ SÁU');
    expect(title).toContain('THỨ BẢY');
    expect(title).not.toContain('FRIDAY');
  });

  it('falls back to the label only when an option has no date', () => {
    expect(weekdayName(null, 'Friday', 'vi')).toBe('Friday');
  });
});
