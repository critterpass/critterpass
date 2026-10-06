import { describe, expect, it } from '@jest/globals';

import { initialDraft } from '../feedback/draft';
import { captureMasked, shakeVerdict, type CapturePorts } from '../shake/capture';
import { maskModeFor, maskStore, type MaskMode } from '../shake/mask';

function ports(capture: () => Promise<string | null>) {
  const seen: (MaskMode | null)[] = [];
  const during: (MaskMode | null)[] = [];
  const value: CapturePorts = {
    setMask: (mode) => {
      seen.push(mode);
      maskStore.set(mode);
    },
    settle: () => Promise.resolve(),
    capture: () => {
      during.push(maskStore.get());
      return capture();
    },
  };
  return { value, seen, during };
}

describe('shake to report', () => {
  it.each(['/wallet', '/wallet/bookings/abc', '/money/add', '/pass', '/crew/c1/chat', '/map/t1'])(
    'covers the whole screen on %s with nothing marked private',
    async (pathname) => {
      const { value, during } = ports(() => Promise.resolve('file:///shot.jpg'));
      expect(await captureMasked(pathname, value)).toBe('file:///shot.jpg');
      expect(during).toEqual(['screen']);
      expect(maskStore.get()).toBeNull();
    },
  );

  it('covers only the marked parts elsewhere, and a look-alike path is not private', async () => {
    expect(maskModeFor('/explore')).toBe('parts');
    expect(maskModeFor('/')).toBe('parts');
    expect(maskModeFor('/passport-photos')).toBe('parts');
    const { value, during } = ports(() => Promise.resolve('file:///shot.jpg'));
    await captureMasked('/explore', value);
    expect(during).toEqual(['parts']);
  });

  it('takes the mask down and attaches nothing when the capture fails', async () => {
    const { value, seen } = ports(() => Promise.reject(new Error('no view')));
    expect(await captureMasked('/wallet', value)).toBeNull();
    expect(seen).toEqual(['screen', null]);
    expect(maskStore.get()).toBeNull();
  });

  it('opens a report only when it is wanted', () => {
    const facts = { enabled: true, pathname: '/explore', typing: false, busy: false };
    expect(shakeVerdict(facts)).toEqual({ open: true });
    expect(shakeVerdict({ ...facts, enabled: false })).toEqual({ open: false, reason: 'off' });
    // On iOS a shake in a text field is "undo typing".
    expect(shakeVerdict({ ...facts, typing: true })).toEqual({ open: false, reason: 'typing' });
    expect(shakeVerdict({ ...facts, busy: true })).toEqual({ open: false, reason: 'busy' });
    expect(shakeVerdict({ ...facts, pathname: '/help-centre/feedback' })).toEqual({
      open: false,
      reason: 'reporting',
    });
  });

  it('starts the report on BUG with the screenshot attached and removable', () => {
    const draft = initialDraft('problem', 'file:///shot.jpg');
    expect(draft.category).toBe('bug');
    expect(draft.attachments).toEqual([
      { uri: 'file:///shot.jpg', contentType: 'image/jpeg', bytes: null },
    ]);
    expect(initialDraft('problem').attachments).toEqual([]);
  });
});
