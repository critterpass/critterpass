/**
 * The guide meter: the chip on the free, boosted and Pass+ meters, the 4b-1 limit card with its
 * actions and hint, and the countdown, which comes from `reset_at` alone.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
jest.mock('expo-router', () => ({ useIsFocused: () => true }));

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { tokens } from '@cp/design-tokens';

import { renderWithI18n } from '@/lib/i18n/testing';

import { LimitCard, LimitComposer } from '../limit-card';
import { MeterChip } from '../meter-chip';
import { guideMeter, isSpent, untilReset, type MeterInputs } from '../meter-model';

const NOW = new Date('2027-04-04T07:48:00Z');
const RESET = '2027-04-04T15:00:00Z';

const base: MeterInputs = {
  passUnlimited: false,
  tripBoosted: false,
  counter: null,
  live: null,
  spent: null,
};

describe('the guide meter', () => {
  it('starts a day with the whole free allowance', () => {
    expect(guideMeter(base, NOW)).toEqual({ kind: 'free', used: 0, limit: 30, resetAt: null });
  });

  it('is unlimited with Pass+ and on a boosted trip', () => {
    expect(guideMeter({ ...base, passUnlimited: true }, NOW).kind).toBe('unlimited');
    expect(guideMeter({ ...base, tripBoosted: true }, NOW).kind).toBe('boosted');
  });

  it('takes the streamed usage over the synced counter, and a refusal over both', () => {
    const counter = { count: 11, limit: 30, resetAt: RESET };
    const live = { used: 12, limit: 30, resetAt: RESET };
    expect(guideMeter({ ...base, counter, live }, NOW)).toMatchObject({ used: 12 });
    const spent = { used: 30, limit: 30, resetAt: RESET };
    const meter = guideMeter({ ...base, counter, live, spent }, NOW);
    expect(isSpent(meter)).toBe(true);
  });

  it('forgets numbers from before the reset', () => {
    const old = '2027-04-03T15:00:00Z';
    const meter = guideMeter(
      {
        ...base,
        counter: { count: 30, limit: 30, resetAt: old },
        spent: { used: 30, limit: 30, resetAt: old },
      },
      NOW,
    );
    expect(meter).toEqual({ kind: 'free', used: 0, limit: 30, resetAt: null });
  });

  it('counts down to reset_at', () => {
    expect(untilReset(RESET, NOW)).toEqual({ hours: 7, minutes: 12 });
    expect(untilReset(RESET, new Date('2027-04-04T16:00:00Z'))).toEqual({ hours: 0, minutes: 0 });
  });
});

describe('the meter chip', () => {
  it('reads the free count, the boosted guide, and nothing with Pass+', async () => {
    await renderWithI18n(
      <>
        <MeterChip
          meter={{ kind: 'free', used: 12, limit: 30, resetAt: RESET }}
          guideName="Tokek"
        />
        <MeterChip meter={{ kind: 'boosted' }} guideName="Pon" />
        <MeterChip meter={{ kind: 'unlimited' }} guideName="Pon" />
      </>,
    );
    expect(screen.getByText('12 OF 30 TODAY')).toBeTruthy();
    expect(screen.getByText('UNLIMITED PON')).toBeTruthy();
    expect(screen.queryByTestId('guide-meter-unlimited')).toBeNull();
  });
});

describe('out of questions', () => {
  it('shows the spent meter, its actions and the crewmate with Pass+', async () => {
    const ask = jest.fn();
    const crewChat = jest.fn();
    await renderWithI18n(
      <GestureHandlerRootView>
        <LimitCard
          guideName="Pon"
          color={tokens.guide.pon}
          used={30}
          limit={30}
          resetAt={RESET}
          destination="Kyoto"
          onGetPass={() => undefined}
          onAskAtMidnight={ask}
          passHolder={{ name: 'Maya', joinIndex: 1 }}
          onCrewChat={crewChat}
        />
        <LimitComposer guideName="Pon" resetAt={RESET} now={NOW} />
      </GestureHandlerRootView>,
    );
    expect(screen.getByText('30 OF 30 TODAY')).toBeTruthy();
    expect(screen.getByText(/Your Kyoto plan and the vote don't count/)).toBeTruthy();
    expect(screen.getByText('Pon is back in 7h 12m')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('guide-limit-queue'));
    expect(ask).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('guide-limit-hint'));
    expect(crewChat).toHaveBeenCalledTimes(1);
  });

  it('hides GET PASS+ until the paywall exists', async () => {
    await renderWithI18n(
      <GestureHandlerRootView>
        <LimitCard
          guideName="Pon"
          color={tokens.guide.pon}
          used={30}
          limit={30}
          resetAt={RESET}
          destination={null}
        />
      </GestureHandlerRootView>,
    );
    expect(screen.queryByTestId('guide-limit-pass')).toBeNull();
    expect(screen.queryByTestId('guide-limit-hint')).toBeNull();
  });
});
