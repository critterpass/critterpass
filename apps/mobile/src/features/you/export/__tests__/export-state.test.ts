/** The Download my data row's state from the synced export rows. */
import { describe, expect, it } from '@jest/globals';

import { exportStateOf, type ExportRow } from '../export-state';

const NOW = new Date('2026-10-03T09:00:00Z');
const row = (over: Partial<ExportRow>): ExportRow => ({
  id: 'e1',
  status: 'queued',
  progress: 0,
  requested_at: '2026-10-03T08:00:00Z',
  expires_at: null,
  ...over,
});

describe('exportStateOf', () => {
  it('reads nothing asked, on its way and ready', () => {
    expect(exportStateOf([], NOW)).toEqual({ kind: 'none' });
    expect(exportStateOf([row({ status: 'building', progress: 40 })], NOW)).toEqual({
      kind: 'building',
      progress: 40,
    });
    expect(
      exportStateOf([row({ status: 'ready', expires_at: '2026-10-10T08:00:00Z' })], NOW),
    ).toEqual({ kind: 'ready', id: 'e1', expiresAt: '2026-10-10T08:00:00Z' });
  });

  it('reads a ready export past its date as expired, before the sweep catches up', () => {
    expect(
      exportStateOf(
        [
          row({
            status: 'ready',
            requested_at: '2026-09-20T08:00:00Z',
            expires_at: '2026-09-27T08:00:00Z',
          }),
        ],
        NOW,
      ),
    ).toEqual({ kind: 'expired', askAgainAt: null });
  });

  it('holds a new request for a day after the last one, but not after a failed one', () => {
    expect(
      exportStateOf([row({ status: 'expired', requested_at: '2026-10-03T08:00:00Z' })], NOW),
    ).toEqual({ kind: 'expired', askAgainAt: '2026-10-04T08:00:00.000Z' });
    expect(exportStateOf([row({ status: 'failed' })], NOW)).toEqual({ kind: 'failed' });
  });
});
