import { describe, expect, it } from '@jest/globals';

import { addWidget, countdownDays, galleryRows } from '../gallery-rows';
import { installedWidgetsPayload } from '../installed-widgets';

const NOW = Date.parse('2026-10-07T00:00:00Z');

const snapshot = (targetAt: string | null) => ({
  schema: 1,
  countdown: targetAt === null ? null : { target_at: targetAt },
});

describe('widget gallery rows', () => {
  it('lists the seven home widgets, free ones first, with the Critterdex', () => {
    expect(galleryRows([]).map((row) => [row.kind, row.tier])).toEqual([
      ['countdown', 'free'],
      ['vote', 'free'],
      ['today', 'free'],
      ['balances', 'free'],
      ['crew', 'boost'],
      ['next_flight', 'pass_plus'],
      ['critterdex', 'free'],
    ]);
  });

  it('marks the widgets already on this phone', () => {
    const rows = galleryRows(['vote', 'next_flight', 'standby_clock']);
    expect(rows.filter((row) => row.added).map((row) => row.kind)).toEqual(['vote', 'next_flight']);
  });
});

describe('adding a widget', () => {
  it('asks the launcher to pin it where it can', () => {
    const asked: string[] = [];
    const pin = (kind: string) => {
      asked.push(kind);
      return true;
    };
    expect(addWidget('crew', pin)).toBe('asked');
    expect(asked).toEqual(['crew']);
  });

  it('shows how to add it by hand when the launcher refuses, fails, or an app cannot add one', () => {
    expect(addWidget('countdown', () => false)).toBe('how_to');
    expect(
      addWidget('countdown', () => {
        throw new Error('no launcher');
      }),
    ).toBe('how_to');
    expect(addWidget('countdown', null)).toBe('how_to');
  });
});

describe('the countdown preview', () => {
  it('counts whole days to the trip', () => {
    expect(countdownDays(snapshot('2026-10-24T06:00:00Z'), NOW)).toBe(17);
    expect(countdownDays(snapshot('2026-10-07T05:00:00Z'), NOW)).toBe(0);
    expect(countdownDays(snapshot('2026-10-01T00:00:00Z'), NOW)).toBe(0);
  });

  it('has no number without a trip to count down to, or a snapshot it cannot read', () => {
    expect(countdownDays(snapshot(null), NOW)).toBeNull();
    expect(countdownDays({ schema: 99 }, NOW)).toBeNull();
    expect(countdownDays(snapshot('soon'), NOW)).toBeNull();
    expect(countdownDays(null, NOW)).toBeNull();
  });
});

describe('the widgets an Android launcher reports', () => {
  it('are synced under the kinds they already carry, once each', () => {
    expect(
      installedWidgetsPayload([
        { kind: 'countdown', family: 'android' },
        { kind: 'countdown', family: 'android' },
        { kind: 'crew', family: 'android' },
        { kind: 'someday', family: 'android' },
      ]).widgets,
    ).toEqual([
      { kind: 'countdown', family: 'android' },
      { kind: 'crew', family: 'android' },
    ]);
  });

  it('still maps the WidgetKit names', () => {
    expect(
      installedWidgetsPayload([{ kind: 'CPVoteWidget', family: 'system_medium' }]).widgets,
    ).toEqual([{ kind: 'vote', family: 'system_medium' }]);
  });
});
