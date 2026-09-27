import { money } from '@cp/cost-engine';
import { renderHook } from '@testing-library/react-native';
import { describe, expect, it } from '@jest/globals';

import { usePriceFormatter, type PriceFormatterSettings } from '../use-price-formatter';

describe('usePriceFormatter', () => {
  it('reproduces the pinned id-ID/en-SG sample: "Rp 75.000 ≈ S$6.40"', async () => {
    const { result } = await renderHook(() =>
      usePriceFormatter({
        locale: 'id-ID',
        homeLocale: 'en-SG',
        priceDisplay: 'both',
        homeCurrency: 'SGD',
      }),
    );

    const rendered = result.current.format(money(7_500_000n, 'IDR'), money(640n, 'SGD'));
    expect(rendered).toBe('Rp 75.000 ≈ S$6.40');
  });

  it('mode local never needs a converted amount', async () => {
    const { result } = await renderHook(() =>
      usePriceFormatter({ locale: 'id-ID', priceDisplay: 'local' }),
    );

    expect(result.current.format(money(7_500_000n, 'IDR'))).toBe('Rp 75.000');
  });

  it('formatCompact renders the "~" approximation marker', async () => {
    const { result } = await renderHook(() =>
      usePriceFormatter({ locale: 'en-US', priceDisplay: 'local' }),
    );

    expect(result.current.formatCompact(money(124_000n, 'USD')).startsWith('~')).toBe(true);
  });

  it('keeps the same formatter identity across re-renders with unchanged settings', async () => {
    const settings = { locale: 'en-US', priceDisplay: 'local' as const };
    const { result, rerender } = await renderHook(
      (props: PriceFormatterSettings) => usePriceFormatter(props),
      { initialProps: settings },
    );
    const first = result.current;
    await rerender(settings);
    expect(result.current).toBe(first);
  });

  it('returns a new formatter once a setting actually changes', async () => {
    const { result, rerender } = await renderHook(
      (props: { locale: string }) => usePriceFormatter({ ...props, priceDisplay: 'local' }),
      { initialProps: { locale: 'en-US' } },
    );
    const first = result.current;
    await rerender({ locale: 'id-ID' });
    expect(result.current).not.toBe(first);
  });
});
