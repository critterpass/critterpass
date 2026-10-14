import { describe, expect, it } from 'vitest';

import {
  busyCurve,
  busyWeek,
  estimateBasis,
  estimatesWire,
  isSocialUrl,
  peakHour,
  placeEstimatesSchema,
  visitBucketOf,
  type BusyWindow,
} from '../../src/places/estimates';

describe('busy windows to hourly curves', () => {
  const windows: BusyWindow[] = [
    { days: 'every_day', from: 9, to: 11, level: 'moderate' },
    { days: 'weekends', from: 10, to: 14, level: 'busy' },
    { days: 'weekdays', from: 16, to: 18, level: 'busy' },
  ];

  it('keeps the busier level where windows overlap and reads gaps inside the day as quiet', () => {
    const saturday = busyCurve(windows, 6);
    expect(saturday?.slice(8, 15)).toEqual([0, 55, 90, 90, 90, 90, 0]);
    const monday = busyCurve(windows, 1);
    expect(monday?.slice(8, 19)).toEqual([0, 55, 55, 20, 20, 20, 20, 20, 90, 90, 0]);
    expect(monday).toHaveLength(24);
  });

  it('writes a curve only for days a window covers', () => {
    const weekendOnly: BusyWindow[] = [{ days: 'weekends', from: 8, to: 10, level: 'busy' }];
    expect(busyWeek(weekendOnly).map((d) => d.dow)).toEqual([0, 6]);
    expect(busyCurve(weekendOnly, 3)).toBeNull();
  });

  it('finds the peak hour', () => {
    expect(peakHour(busyCurve(windows, 0) ?? [])).toBe(10);
    expect(peakHour(Array.from({ length: 24 }, () => 0))).toBeNull();
  });

  it('refuses a window that ends before it starts', () => {
    expect(
      placeEstimatesSchema.safeParse({
        busy: {
          value: [{ days: 'every_day', from: 14, to: 10, level: 'busy' }],
          basis: 'estimate',
        },
      }).success,
    ).toBe(false);
  });
});

describe('basis rules', () => {
  const blog = 'https://travelblog.example/da-lat';
  const tiktok = 'https://www.tiktok.com/@someone/video/1';

  it('cites only a quote found on its page', () => {
    expect(estimateBasis('fee', blog, true)).toBe('cited');
    expect(estimateBasis('fee', blog, false)).toBe('estimate');
    expect(estimateBasis('other', null, true)).toBe('estimate');
  });

  it('never cites a fee or a dress rule from a social page, but a tip may', () => {
    expect(isSocialUrl(tiktok)).toBe(true);
    expect(isSocialUrl('https://m.facebook.com/page')).toBe(true);
    expect(isSocialUrl(blog)).toBe(false);
    expect(estimateBasis('fee', tiktok, true)).toBe('estimate');
    expect(estimateBasis('dress', tiktok, true)).toBe('estimate');
    expect(estimateBasis('other', tiktok, true)).toBe('cited');
  });

  it('buckets visit lengths', () => {
    expect(visitBucketOf(20)).toBe('under_30');
    expect(visitBucketOf(90)).toBe('1_2h');
    expect(visitBucketOf(240)).toBe('half_day');
    expect(visitBucketOf(900)).toBe('full_day');
  });
});

describe('the reader’s estimates', () => {
  const stored = placeEstimatesSchema.parse({
    visit: { value: { bucket: '1_2h', minutes: 90 }, basis: 'estimate' },
    fee: { value: { en: '50,000 VND', vi: '50.000 đồng' }, basis: 'cited', source: 'https://a.vn' },
    tips: [{ value: { en: 'Go early' }, basis: 'estimate' }],
  });

  it('labels each field and falls back to English per line', () => {
    const vi = estimatesWire(stored, 'vi');
    expect(vi.fee).toEqual({ text: '50.000 đồng', label: 'cited', sourceUrl: 'https://a.vn' });
    expect(vi.tips).toEqual([{ text: 'Go early', label: 'estimate', sourceUrl: null }]);
    expect(vi.locale).toBe('en');
    expect(vi.visit).toEqual({ bucket: '1_2h', minutes: 90, label: 'estimate', sourceUrl: null });
    expect(vi.busy).toBeNull();
  });
});
