import { act, renderHook } from '@testing-library/react-native';
import { describe, expect, it } from '@jest/globals';

import { useOneLineWidth } from '../one-line-width';

// "1 ¥ ≈ 164 ₫" as Android laid it out in a pill measured short: the amount dropped to line two.
const WRAPPED = [{ width: 41.6 }, { width: 38.2 }];

describe('useOneLineWidth', () => {
  it('widens a wrapped label to its drawn lines plus a space, once', async () => {
    const { result } = await renderHook(() => useOneLineWidth(true, 11));
    expect(result.current.style).toBeNull();

    let widening = false;
    await act(() => {
      widening = result.current.onLines(WRAPPED);
    });
    expect(widening).toBe(true);
    expect(result.current.style).toEqual({ minWidth: 86 });

    // The same short layout again (before the new width lands) changes nothing.
    await act(() => {
      widening = result.current.onLines(WRAPPED);
    });
    expect(widening).toBe(false);
    expect(result.current.style).toEqual({ minWidth: 86 });
  });

  it('leaves a label on one line, or one not asking for it, as it is', async () => {
    const { result } = await renderHook(() => useOneLineWidth(true, 11));
    expect(result.current.onLines([{ width: 80 }])).toBe(false);
    expect(result.current.style).toBeNull();

    const off = await renderHook(() => useOneLineWidth(false, 11));
    await act(() => {
      expect(off.result.current.onLines(WRAPPED)).toBe(false);
    });
    expect(off.result.current.style).toBeNull();
  });
});
