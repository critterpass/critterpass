import { describe, expect, it } from '@jest/globals';

import { alignClock, clockWidth } from '../timeline';

const FIGURE = ' ';

describe('the timeline clock column', () => {
  it('pads a one-digit hour when the column also holds two-digit hours', () => {
    const times = ['8:00am', '9:45am', '11:30am', '1:00pm'];
    expect(times.map((time) => alignClock(time, times))).toEqual([
      `${FIGURE}8:00am`,
      `${FIGURE}9:45am`,
      '11:30am',
      `${FIGURE}1:00pm`,
    ]);
  });

  it('leaves a column of same-width hours alone', () => {
    const times = ['09:00', '13:00', undefined];
    expect(alignClock('09:00', times)).toBe('09:00');
    expect(alignClock('8:00am', ['8:00am', '9:45am'])).toBe('8:00am');
  });

  it('widens with the reader’s text size, up to the label cap', () => {
    expect(clockWidth(['14:30'])).toBe(44);
    expect(clockWidth(['11:30am'])).toBe(64);
    expect(clockWidth(['11:30am'], 1.2)).toBe(77);
    expect(clockWidth(['11:30am'], 3)).toBe(96);
  });
});
