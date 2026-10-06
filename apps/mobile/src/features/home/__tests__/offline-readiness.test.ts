/**
 * Home's offline line says ready only when the trip's place cards and its saved days are all on
 * the phone, otherwise the first thing still on its way, and nothing outside the offline window.
 */
import { describe, expect, it } from '@jest/globals';

import { offlineLineFor, type OfflineReadinessInput } from '../offline-readiness';

const base: OfflineReadinessInput = {
  today: '2026-10-14',
  startDate: '2026-10-12',
  endDate: '2026-10-19',
  missingPlaces: 0,
  synced: true,
  days: [{ localDate: '2026-10-14', missing: [] }],
};

describe('Home’s offline line', () => {
  it('reads ready once every stop’s card and today’s files are on the phone', () => {
    expect(offlineLineFor(base)).toEqual({ kind: 'ready' });
  });

  it('shows only for a trip under way or starting within two days', () => {
    expect(offlineLineFor({ ...base, today: '2026-10-09', days: [] })).toBeNull();
    expect(offlineLineFor({ ...base, today: '2026-10-10', days: [] })).toEqual({ kind: 'ready' });
    expect(offlineLineFor({ ...base, today: '2026-10-20', days: [] })).toEqual({ kind: 'ready' });
    expect(offlineLineFor({ ...base, today: '2026-10-21' })).toBeNull();
    expect(offlineLineFor({ ...base, startDate: null })).toBeNull();
  });

  it('waits for the trip’s places first, including before the first sync', () => {
    expect(offlineLineFor({ ...base, missingPlaces: 2 })).toEqual({
      kind: 'downloading',
      what: 'places',
    });
    expect(offlineLineFor({ ...base, synced: false })).toEqual({
      kind: 'downloading',
      what: 'places',
    });
  });

  it('owes today’s files while the trip is under way, not a day already past', () => {
    expect(offlineLineFor({ ...base, days: [{ localDate: '2026-10-13', missing: [] }] })).toEqual({
      kind: 'downloading',
      what: 'today',
    });
    const before = { ...base, today: '2026-10-11', days: [] };
    expect(offlineLineFor(before)).toEqual({ kind: 'ready' });
  });

  it('names the first file still coming, then any the phone had no room for', () => {
    const days = [
      {
        localDate: '2026-10-14',
        missing: [{ kind: 'map_region' as const, label: 'Map', reason: 'space' as const }],
      },
      {
        localDate: '2026-10-15',
        missing: [
          { kind: 'phrase_audio' as const, label: 'Phrases', reason: 'failed' as const },
          { kind: 'attachment' as const, label: 'Pickup', reason: 'failed' as const },
        ],
      },
    ];
    expect(offlineLineFor({ ...base, days })).toEqual({ kind: 'downloading', what: 'tickets' });
    expect(offlineLineFor({ ...base, days: days.slice(0, 1) })).toEqual({
      kind: 'no_space',
      what: 'map',
    });
    const past = [{ localDate: '2026-10-13', missing: days[1]!.missing }, days[0]!];
    expect(offlineLineFor({ ...base, days: past })).toEqual({ kind: 'no_space', what: 'map' });
  });
});
