import { describe, expect, it } from '@jest/globals';

import { readPaste, showsPasteHint, type PasteClipboard } from '../paste-read';

const clipboard = (has: boolean, text: string | Error): PasteClipboard => ({
  hasStringAsync: () => Promise.resolve(has),
  getStringAsync: () => (text instanceof Error ? Promise.reject(text) : Promise.resolve(text)),
});

describe('a paste from the drawn control', () => {
  it('pastes trimmed text, and reads nothing on iOS when the clipboard holds none', async () => {
    expect(await readPaste(clipboard(true, '  CP-42 '), true)).toEqual({
      kind: 'text',
      text: 'CP-42',
    });
    expect(await readPaste(clipboard(false, 'never read'), true)).toEqual({ kind: 'empty' });
  });

  it('takes an empty or failed iOS read of a full clipboard as a refusal', async () => {
    expect(await readPaste(clipboard(true, ''), true)).toEqual({ kind: 'refused' });
    expect(await readPaste(clipboard(true, new Error('denied')), true)).toEqual({
      kind: 'refused',
    });
  });

  it('never calls an Android read a refusal', async () => {
    expect(await readPaste(clipboard(false, ''), false)).toEqual({ kind: 'empty' });
    expect(await readPaste(clipboard(false, 'link'), false)).toEqual({
      kind: 'text',
      text: 'link',
    });
  });

  it('points to Settings after every refusal and once after an iOS paste', () => {
    const pasted = { kind: 'text', text: 'x' } as const;
    expect(showsPasteHint({ kind: 'refused' }, true, true)).toBe(true);
    expect(showsPasteHint(pasted, true, false)).toBe(true);
    expect(showsPasteHint(pasted, true, true)).toBe(false);
    expect(showsPasteHint({ kind: 'empty' }, true, false)).toBe(false);
    expect(showsPasteHint({ kind: 'refused' }, false, false)).toBe(false);
  });
});
