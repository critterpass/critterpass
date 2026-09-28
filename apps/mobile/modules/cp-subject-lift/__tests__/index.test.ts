import { describe, expect, it } from '@jest/globals';

import { AVATAR_PNG_SIZE, fromNativeModule, getSubjectLift } from '../index';
import type { NativeCpSubjectLiftModule, NativeLiftResult } from '../src/CpSubjectLiftModule';

/** The native module is the boundary: a recording stand-in answering like the device would. */
function fakeNative(answer: NativeLiftResult, supported = true) {
  const calls: unknown[][] = [];
  const native = {
    isSupported: () => supported,
    lift: (uri: string) => {
      calls.push(['lift', uri]);
      return Promise.resolve(answer);
    },
    prepare: (uri: string, cutout: boolean, zoom: number, size: number) => {
      calls.push(['prepare', uri, cutout, zoom, size]);
      return Promise.resolve({ uri: 'file:///avatar.png', sha256: 'ab'.repeat(32), byteLength: 9 });
    },
  } as unknown as NativeCpSubjectLiftModule;
  return { native, calls };
}

describe('cp-subject-lift', () => {
  it('is absent from a binary built without the module', () => {
    expect(getSubjectLift()).toBeNull();
  });

  it('hands back the cut-out when a subject was found', async () => {
    const { native, calls } = fakeNative({
      found: true,
      uri: 'file:///cut.png',
      width: 300,
      height: 420,
    });
    const api = fromNativeModule(native);
    expect(api.canLift).toBe(true);
    await expect(api.lift('file:///photo.jpg')).resolves.toEqual({
      uri: 'file:///cut.png',
      width: 300,
      height: 420,
    });
    expect(calls).toEqual([['lift', 'file:///photo.jpg']]);
  });

  it('reports no subject as null so the photo takes the circle crop', async () => {
    const api = fromNativeModule(fakeNative({ found: false }, false).native);
    expect(api.canLift).toBe(false);
    await expect(api.lift('file:///sky.jpg')).resolves.toBeNull();
  });

  it('prepares the square avatar at the upload size, never zoomed out', async () => {
    const { native, calls } = fakeNative({ found: false });
    const api = fromNativeModule(native);
    await api.prepare('file:///cut.png', { cutout: true, zoom: 0.5 });
    await api.prepare('file:///photo.jpg', { cutout: false, zoom: 1.4, size: 256 });
    expect(calls).toEqual([
      ['prepare', 'file:///cut.png', true, 1, AVATAR_PNG_SIZE],
      ['prepare', 'file:///photo.jpg', false, 1.4, 256],
    ]);
  });
});
