import { describe, expect, it } from '@jest/globals';

import {
  photoServicesFrom,
  type AvatarLifter,
  type PhotoPicker,
  type PresignHttp,
} from '../photo/photo-pipeline';

/** The native lift is the boundary: answers like a device with (or without) segmentation. */
function lifter(canLift: boolean, calls: unknown[][]): AvatarLifter {
  return {
    canLift,
    lift: (uri) => {
      calls.push(['lift', uri]);
      return Promise.resolve({ uri: `${uri}.cut.png` });
    },
    prepare: (uri, options) => {
      calls.push(['prepare', uri, options]);
      return Promise.resolve({ uri: 'file:///avatar.png', sha256: 'c'.repeat(64) });
    },
  };
}

const picker: PhotoPicker = {
  pickFromLibrary: () => Promise.resolve(null),
  takePhoto: () => Promise.resolve({ kind: 'cancelled' }),
};

const http: PresignHttp = {
  postJson: () =>
    Promise.resolve({
      status: 200,
      body: { media_key: 'avatars/u1/a.png', put_url: 'https://r2.example/put', headers: {} },
    }),
  put: () => Promise.resolve(200),
};

const readBytes = (uri: string) =>
  Promise.resolve(uri === 'file:///avatar.png' ? new Uint8Array([1, 2, 3]) : new Uint8Array());

describe('photo services over the subject lift', () => {
  it('lifts the subject where the device can segment', async () => {
    const calls: unknown[][] = [];
    const services = photoServicesFrom(lifter(true, calls), picker, http, readBytes);
    await expect(services.lift?.lift('file:///p.jpg')).resolves.toMatchObject({
      uri: 'file:///p.jpg.cut.png',
    });
    expect(calls).toEqual([['lift', 'file:///p.jpg']]);
  });

  it('offers no lift where it cannot, so every photo takes the circle crop', () => {
    expect(photoServicesFrom(lifter(false, []), picker, http, readBytes).lift).toBeNull();
  });

  it('prepares the avatar PNG with its bytes and checksum, then uploads it', async () => {
    const calls: unknown[][] = [];
    const services = photoServicesFrom(lifter(true, calls), picker, http, readBytes);
    const prepared = await services.prepare('file:///p.jpg.cut.png', true, 1.3);
    expect(calls).toEqual([['prepare', 'file:///p.jpg.cut.png', { cutout: true, zoom: 1.3 }]]);
    expect(prepared).toEqual({
      uri: 'file:///avatar.png',
      bytes: new Uint8Array([1, 2, 3]),
      sha256: 'c'.repeat(64),
      cutout: true,
    });
    await expect(services.upload(prepared, () => undefined)).resolves.toEqual({
      kind: 'uploaded',
      mediaKey: 'avatars/u1/a.png',
    });
  });
});
