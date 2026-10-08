import { describe, expect, it } from 'vitest';

import { FORMER_APP_LINK_SAMPLES } from '../app-link-samples';
import { currentAppPath, tripDayOfPath } from '../trip-paths';

const TRIP = '0b8f6c1e-58f1-4a53-9d0e-6a8c8f0f4a11';

describe('former paths of links already sent', () => {
  it('reads the hub shapes of rows already sent as the same screens', () => {
    expect(currentAppPath(`/hub/${TRIP}`)).toBe(`/trips/${TRIP}`);
    expect(currentAppPath(`/hub/${TRIP}/`)).toBe(`/trips/${TRIP}`);
    expect(currentAppPath(`/hub/${TRIP}/day/2026-10-17`)).toBe(`/trips/${TRIP}/day/2026-10-17`);
    expect(currentAppPath(`/hub/${TRIP}/day/today?from=push`)).toBe(
      `/trips/${TRIP}/day/today?from=push`,
    );
  });

  it('reads every former path of a link already sent as the screen it names today', () => {
    const id = '0190f3a2-7c11-7e4b-9a55-0d2c8e6f1b01';
    expect(currentAppPath(`/wallet/money/payment/${id}`)).toBe(`/money/payment/${id}`);
    expect(currentAppPath(`/wallet/money/expense/${id}`)).toBe(`/money/expense/${id}`);
    expect(currentAppPath('/wallet/money/settle')).toBe('/money/settle');
    expect(currentAppPath(`/help/${TRIP}/session/${id}`)).toBe(`/map/${TRIP}`);
    expect(currentAppPath('/money')).toBe('/wallet/money');
    expect(currentAppPath(`/polls/${id}`)).toBe(`/vote/${id}`);
    expect(currentAppPath('/guide')).toBe('/guide/new');
    expect(currentAppPath(`/polls/${id}?from=briefing`)).toBe(`/vote/${id}?from=briefing`);
  });

  it('has a sample of every former path, each read as the link that replaced it', () => {
    expect(FORMER_APP_LINK_SAMPLES.length).toBeGreaterThanOrEqual(9);
    for (const { former, current } of FORMER_APP_LINK_SAMPLES) {
      expect(currentAppPath(former)).toBe(current);
      expect(currentAppPath(current)).toBe(current);
    }
  });

  it('leaves every other path alone, the offline pages under hub included', () => {
    for (const path of [
      `/hub/${TRIP}/offline`,
      '/hub/offline-storage',
      '/hub/',
      `/trips/${TRIP}`,
      `/crew/${TRIP}/chat`,
      `/trip/${TRIP}/plan`,
      '/wallet/money',
      '/wallet/money/budget',
      '/money/settle',
      `/guide/${TRIP}`,
      '/guide/voice',
      '/help',
      '/help/lost',
    ]) {
      expect(currentAppPath(path)).toBe(path);
    }
  });

  it('names the trip and day of a day-of path in either shape', () => {
    const day = { tripId: TRIP, localDate: '2026-10-17' };
    expect(tripDayOfPath(`/hub/${TRIP}/day/2026-10-17`)).toEqual(day);
    expect(tripDayOfPath(`/trips/${TRIP}/day/2026-10-17`)).toEqual(day);
    expect(tripDayOfPath(`/trips/${TRIP}`)).toBeNull();
    expect(tripDayOfPath(`/crew/${TRIP}/chat`)).toBeNull();
  });
});
