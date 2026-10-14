/* eslint-disable critterpass/no-literal-style -- colour parsing is the subject under test */
import { describe, expect, it } from '@jest/globals';

import { edgeGradient, edgesOf, transparentOf } from '../scroll-edge';

describe('scroll edges', () => {
  it('covers the top only once content has scrolled past the hero', () => {
    expect(edgesOf(0, 600, 1200, 0).top).toBe(false);
    expect(edgesOf(40, 600, 1200, 0).top).toBe(true);
    expect(edgesOf(200, 600, 1200, 280).top).toBe(false);
    expect(edgesOf(300, 600, 1200, 280).top).toBe(true);
  });

  it('covers the bottom while content runs on under it', () => {
    expect(edgesOf(0, 600, 1200, 0).bottom).toBe(true);
    expect(edgesOf(600, 600, 1200, 0).bottom).toBe(false);
    // Content shorter than the viewport, and a viewport not laid out yet.
    expect(edgesOf(0, 600, 400, 0).bottom).toBe(false);
    expect(edgesOf(0, 0, 1200, 0).bottom).toBe(false);
  });

  it('fades to the same colour at no opacity, never through grey', () => {
    expect(transparentOf('#f5f5f7')).toBe('rgba(245,245,247,0)');
    expect(transparentOf('#fff')).toBe('rgba(255,255,255,0)');
    expect(transparentOf('rgba(248, 248, 250, .86)')).toBe('rgba(248,248,250,0)');
  });

  it('keeps the solid part opaque at the edge before it fades', () => {
    expect(edgeGradient('bottom', 100, 76, '#f5f5f7')).toBe(
      'linear-gradient(0deg, #f5f5f7 0%, #f5f5f7 76%, rgba(245,245,247,0) 100%)',
    );
    expect(edgeGradient('top', 24, 0, '#000000')).toBe(
      'linear-gradient(180deg, #000000 0%, #000000 0%, rgba(0,0,0,0) 100%)',
    );
  });
});
