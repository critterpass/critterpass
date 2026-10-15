import { describe, expect, it } from '@jest/globals';

import { pillLabel } from '../Button';

describe('pill labels', () => {
  it('draws a typed picker chevron as the glyph', () => {
    expect(pillLabel('Today ⌄', false)).toEqual({ text: 'Today', chevron: true });
    expect(pillLabel('VND ⌄ ', false)).toEqual({ text: 'VND', chevron: true });
  });

  it('keeps a plain label and the chevron the caller asked for', () => {
    expect(pillLabel('Add', false)).toEqual({ text: 'Add', chevron: false });
    expect(pillLabel('VND', true)).toEqual({ text: 'VND', chevron: true });
  });
});
