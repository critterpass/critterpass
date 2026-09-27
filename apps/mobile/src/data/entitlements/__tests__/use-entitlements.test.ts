import { renderHook } from '@testing-library/react-native';
import { describe, expect, it } from '@jest/globals';

import { useEntitlements, type UseEntitlementsInput } from '../use-entitlements';

describe('useEntitlements', () => {
  it('is fully locked-down with no synced rows at all (before anything has ever synced)', async () => {
    const { result } = await renderHook(() => useEntitlements({}));
    expect(result.current).toMatchObject({
      passPlus: false,
      guideUnlimited: false,
      iconStylesAll: false,
      boostActive: false,
      seatCap: undefined,
      redraftLimit: undefined,
      liveMap: false,
      sponsored: undefined,
      guideMeter: undefined,
      perks: [],
    });
  });

  it('resolves guideUnlimited from either the user or the trip', async () => {
    const fromUser = await renderHook(() =>
      useEntitlements({
        user: { passPlus: true, guideUnlimitedGlobal: true, iconStyles: ['all'] },
      }),
    );
    expect(fromUser.result.current.guideUnlimited).toBe(true);
    expect(fromUser.result.current.iconStylesAll).toBe(true);

    const fromTrip = await renderHook(() =>
      useEntitlements({
        user: { passPlus: false, guideUnlimitedGlobal: false, iconStyles: [] },
        trip: {
          boostActive: true,
          seatCap: 16,
          redraftLimit: Infinity,
          liveMap: true,
          sponsored: false,
        },
      }),
    );
    expect(fromTrip.result.current.guideUnlimited).toBe(true);
    expect(fromTrip.result.current.iconStylesAll).toBe(false);
    expect(fromTrip.result.current.seatCap).toBe(16);
    expect(fromTrip.result.current.redraftLimit).toBe(Infinity);
  });

  it('combines the trip sponsored baseline with the viewer’s own Pass+', async () => {
    const freeViewerOnUnboostedTrip = await renderHook(() =>
      useEntitlements({
        user: { passPlus: false, guideUnlimitedGlobal: false, iconStyles: [] },
        trip: { boostActive: false, seatCap: 6, redraftLimit: 3, liveMap: false, sponsored: true },
      }),
    );
    expect(freeViewerOnUnboostedTrip.result.current.sponsored).toBe(true);

    const passPlusViewerOnUnboostedTrip = await renderHook(() =>
      useEntitlements({
        user: { passPlus: true, guideUnlimitedGlobal: true, iconStyles: ['all'] },
        trip: { boostActive: false, seatCap: 6, redraftLimit: 3, liveMap: false, sponsored: true },
      }),
    );
    expect(passPlusViewerOnUnboostedTrip.result.current.sponsored).toBe(false);

    const freeViewerOnBoostedTrip = await renderHook(() =>
      useEntitlements({
        user: { passPlus: false, guideUnlimitedGlobal: false, iconStyles: [] },
        trip: {
          boostActive: true,
          seatCap: 16,
          redraftLimit: Infinity,
          liveMap: true,
          sponsored: false,
        },
      }),
    );
    expect(freeViewerOnBoostedTrip.result.current.sponsored).toBe(false);
  });

  it('allows the 29th guide question and locks on the 30th, with a real resetAt', async () => {
    const allowed = await renderHook(() =>
      useEntitlements({
        guideUsage: { used: 29, limit: 30, resetAt: '2026-06-16T00:00:00+08:00' },
      }),
    );
    expect(allowed.result.current.guideMeter).toEqual({
      ok: true,
      used: 29,
      limit: 30,
      resetAt: '2026-06-16T00:00:00+08:00',
    });

    const locked = await renderHook(() =>
      useEntitlements({
        guideUsage: { used: 30, limit: 30, resetAt: '2026-06-16T00:00:00+08:00' },
      }),
    );
    expect(locked.result.current.guideMeter).toEqual({
      ok: false,
      detail: { used: 30, limit: 30, resetAt: '2026-06-16T00:00:00+08:00' },
    });
  });

  it('renders only enabled perks, sorted, never a disabled one', async () => {
    const { result } = await renderHook(() =>
      useEntitlements({
        perks: [
          { key: 'b', tier: 'boost', copyKey: 'monetize.perks.b', enabled: true, sort: 2 },
          {
            key: 'hidden',
            tier: 'pass_plus',
            copyKey: 'monetize.perks.hidden',
            enabled: false,
            sort: 1,
          },
          { key: 'a', tier: 'pass_plus', copyKey: 'monetize.perks.a', enabled: true, sort: 1 },
        ],
      }),
    );
    expect(result.current.perks.map((perk) => perk.key)).toEqual(['a', 'b']);
  });

  it('keeps the same result identity across re-renders with unchanged inputs', async () => {
    const props: UseEntitlementsInput = {
      user: { passPlus: true, guideUnlimitedGlobal: true, iconStyles: ['all'] },
    };
    const { result, rerender } = await renderHook((p: UseEntitlementsInput) => useEntitlements(p), {
      initialProps: props,
    });
    const first = result.current;
    await rerender(props);
    expect(result.current).toBe(first);
  });
});
