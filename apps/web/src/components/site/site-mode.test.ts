import { describe, expect, it } from 'vitest';

import { siteMode } from './site-mode';

describe('siteMode', () => {
  it('keeps the coming-soon page only when asked to', () => {
    expect(siteMode('coming-soon')).toBe('coming-soon');
    expect(siteMode('site')).toBe('site');
    expect(siteMode(undefined)).toBe('site');
    expect(siteMode('anything else')).toBe('site');
  });
});
