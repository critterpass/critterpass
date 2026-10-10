/**
 * The change poster's rows and footer: stop changes in the trip's local clock (an added stop has no
 * "before", a dropped one no "after"), turned-off ops and driver picks left out, at most three rows,
 * the yeses each policy needs, and voters as an initial on their crew colour.
 */
import { describe, expect, it } from 'vitest';

import { changeRows, posterVoter, yesesNeeded } from '../../src/jobs/plan/changeset-poster';

const id = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const base = { reason: 'swap', affected_user_ids: [], booking_impact: false };
const at = (iso: string) => ({ starts_at: iso, poi_id: id(900) });

describe('change poster rows', () => {
  const names = new Map([[id(900), 'Campuhan Ridge']]);

  it('words a retime in the trip clock, and adds and removes with an empty side', () => {
    const rows = changeRows(
      [
        {
          ...base,
          op: 'retime',
          target: id(1),
          before: at('2026-10-12T05:00:00Z'),
          after: at('2026-10-12T07:30:00Z'),
        },
        {
          ...base,
          op: 'add',
          target: id(2),
          after: {
            custom_place: { name: 'Ubud market', lat: 0, lng: 0 },
            starts_at: '2026-10-12T02:00:00Z',
          },
        },
        { ...base, op: 'remove', target: id(3), before: at('2026-10-12T09:00:00Z') },
      ],
      names,
      'Asia/Makassar',
    );
    expect(rows).toEqual([
      { label: 'Campuhan Ridge', from: '13:00', to: '15:30' },
      { label: 'Ubud market', from: null, to: '10:00' },
      { label: 'Campuhan Ridge', from: '17:00', to: null },
    ]);
  });

  it('leaves out turned-off ops, unnamed stops and anything past three rows', () => {
    const retime = (n: number, accepted?: boolean) => ({
      ...base,
      op: 'retime',
      target: id(n),
      before: at('2026-10-12T05:00:00Z'),
      after: at('2026-10-12T06:00:00Z'),
      ...(accepted === undefined ? {} : { accepted }),
    });
    const unnamed = {
      ...base,
      op: 'retime',
      target: id(9),
      after: { starts_at: '2026-10-12T06:00:00Z' },
    };
    const rows = changeRows(
      [retime(1, false), unnamed, retime(2), retime(3), retime(4), retime(5)],
      names,
      'UTC',
    );
    expect(rows).toHaveLength(3);
  });
});

describe('change poster footer', () => {
  it('needs the yeses each policy decides on', () => {
    expect(yesesNeeded('majority_of_affected', null, 3)).toBe(2);
    expect(yesesNeeded('majority_of_affected', null, 4)).toBe(3);
    expect(yesesNeeded('threshold_n', 2, 5)).toBe(2);
    expect(yesesNeeded('any_affected', null, 5)).toBe(1);
    expect(yesesNeeded('organiser', null, 5)).toBe(1);
    expect(yesesNeeded(null, null, 4)).toBe(4);
  });

  it('shows a voter as an initial on their crew colour, never a name', () => {
    expect(posterVoter('maya putri', 'pink/dashed')).toEqual({ initial: 'M', tone: 'pink' });
    expect(posterVoter(null, null)).toEqual({ initial: '?', tone: null });
  });
});
