/**
 * A question handed back to the guide sheet (the menu camera's follow-ups): the sheet on top takes
 * it, and with no sheet open the caller is told so and opens one itself.
 */
import { describe, expect, it } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';

import { handToSheet, useHandedQuestion } from '../data/handed-question';

describe('handing a question to the guide sheet', () => {
  it('is refused when no sheet is open', () => {
    expect(handToSheet('Least spicy?')).toBe(false);
  });

  it('goes to the sheet on top, and to none once it has closed', async () => {
    const under: string[] = [];
    const top: string[] = [];
    const first = await renderHook(() => useHandedQuestion((text) => under.push(text)));
    const second = await renderHook(() => useHandedQuestion((text) => top.push(text)));
    expect(handToSheet('Least spicy?')).toBe(true);
    expect([under, top]).toEqual([[], ['Least spicy?']]);

    await second.unmount();
    expect(handToSheet('What do we order?')).toBe(true);
    expect(under).toEqual(['What do we order?']);

    await first.unmount();
    expect(handToSheet('Anyone there?')).toBe(false);
  });
});
