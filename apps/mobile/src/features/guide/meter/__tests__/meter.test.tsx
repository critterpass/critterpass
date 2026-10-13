/**
 * The guide meter: the chip on the free, boosted and Pass+ meters, the 4b-1 limit card with its
 * actions and hint, and the countdown, which comes from `reset_at` alone.
 */

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { tokens } from '@cp/design-tokens';

import { renderWithI18n } from '@/lib/i18n/testing';

import { LimitCard, QuotaChip } from '../../premium/guide-limit';
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
  it('reads what is left, the spent count, the boosted guide, and nothing with Pass+', async () => {
    await renderWithI18n(
      <>
        <QuotaChip
          meter={{ kind: 'free', used: 12, limit: 30, resetAt: RESET }}
          guideName="Tokek"
        />
        <QuotaChip
          meter={{ kind: 'free', used: 30, limit: 30, resetAt: RESET }}
          guideName="Tokek"
        />
        <QuotaChip meter={{ kind: 'boosted' }} guideName="Pon" />
        <QuotaChip meter={{ kind: 'unlimited' }} guideName="Pon" />
      </>,
    );
    expect(screen.getByText('18 left')).toBeTruthy();
    expect(screen.getByText('30 of 30 today')).toBeTruthy();
    expect(screen.getByText('Unlimited Pon')).toBeTruthy();
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
          used={30}
          limit={30}
          onGetPass={() => undefined}
          onAtMidnight={ask}
          asking={false}
          passHolder={{ name: 'Maya', color: tokens.guide.pon }}
          onCrewChat={crewChat}
        />
      </GestureHandlerRootView>,
    );
    expect(screen.getByText('of 30')).toBeTruthy();
    expect(screen.getByText(/the free ones are used up/u)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('guide-limit-midnight'));
    expect(ask).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('guide-limit-crew-chat'));
    expect(crewChat).toHaveBeenCalledTimes(1);
  });

  it('hides Get Pass+ until the paywall exists, and the crewmate without one', async () => {
    await renderWithI18n(
      <GestureHandlerRootView>
        <LimitCard guideName="Pon" used={30} limit={30} asking={false} passHolder={null} />
      </GestureHandlerRootView>,
    );
    expect(screen.queryByTestId('guide-limit-pass')).toBeNull();
    expect(screen.queryByTestId('guide-limit-crew-chat')).toBeNull();
  });
});
