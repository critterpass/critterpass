import { describe, expect, it } from '@jest/globals';

import { classifyPaste } from '../paste-classify';

describe('a first-launch paste', () => {
  it('passes a crew code on to be claimed', () => {
    expect(classifyPaste(' kq7m3p ')).toEqual({ kind: 'invite' });
  });

  it('names the app a link came from', () => {
    expect(classifyPaste('https://www.tiktok.com/@x/video/1')).toEqual({
      kind: 'other',
      source: 'tiktok',
    });
    expect(classifyPaste('https://youtu.be/abc')).toEqual({ kind: 'other', source: 'youtube' });
  });

  it('says nothing about where plain text or an unknown site came from', () => {
    expect(classifyPaste('see you at 7')).toEqual({ kind: 'other', source: null });
    expect(classifyPaste('https://example.org/a')).toEqual({ kind: 'other', source: null });
  });
});
