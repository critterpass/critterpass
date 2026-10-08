/**
 * What the places map picks up after a look at the list: its camera and pick, but never over a
 * place the map was opened on, another filter's frame, or another trip's places.
 */
import { beforeEach, describe, expect, it } from '@jest/globals';

import { forgetPlaces, frameKey, mapResume, recallPlaces, rememberPlaces } from '../places-resume';

const camera = {
  center: [115.26, -8.5] as [number, number],
  zoom: 13.4,
  frame: frameKey('all', undefined),
};

describe('the places map and list remembering for each other', () => {
  beforeEach(() => {
    forgetPlaces('trip-1');
    forgetPlaces('trip-2');
  });

  it('comes back to the camera and the picked place for the same filter', () => {
    rememberPlaces('trip-1', { camera, pickedId: 'poi-9' });
    expect(mapResume('trip-1', undefined, frameKey('all', undefined))).toEqual({
      camera,
      pickedId: 'poi-9',
    });
  });

  it('starts afresh when the map is opened on a place or the filter changed in the list', () => {
    rememberPlaces('trip-1', { camera, pickedId: 'poi-9' });
    const fresh = { camera: undefined, pickedId: null };
    expect(mapResume('trip-1', 'poi-2', frameKey('all', undefined))).toEqual(fresh);
    expect(mapResume('trip-1', undefined, frameKey('food', undefined))).toEqual(fresh);
    expect(mapResume('trip-1', undefined, frameKey('all', ['ramen']))).toEqual(fresh);
  });

  it('holds one trip at a time and lets go when asked', () => {
    rememberPlaces('trip-1', { sort: 'az', listOffset: 420 });
    rememberPlaces('trip-1', { listOffset: 600 });
    expect(recallPlaces('trip-1')).toEqual({ sort: 'az', listOffset: 600 });
    rememberPlaces('trip-2', { sort: 'nearest' });
    expect(recallPlaces('trip-1')).toEqual({});
    forgetPlaces('trip-2');
    expect(recallPlaces('trip-2')).toEqual({});
    expect(recallPlaces(undefined)).toEqual({});
  });
});
