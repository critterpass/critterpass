import { describe, expect, it } from 'vitest';

import { boxKm2, MAX_BOX_KM2, planWanted } from './plan-wanted';

const BANGKOK = { slug: 'th-bangkok', bounds: [100.0773, 13.3482, 100.9097, 14.1567] };
const MARRAKECH = { slug: 'ma-marrakech', bounds: [-8.3865, 31.3105, -7.6135, 31.9495] };
const none = () => Promise.resolve(404);

describe('planWanted', () => {
  it('builds what is waiting, in the order given, with its Geofabrik extract', async () => {
    const plan = await planWanted([BANGKOK, MARRAKECH], 6, none);
    expect(plan.build).toEqual([
      {
        slug: 'th-bangkok',
        bounds: '100.0773,13.3482,100.9097,14.1567',
        geofabrikRegion: 'asia/thailand',
      },
      {
        slug: 'ma-marrakech',
        bounds: '-8.3865,31.3105,-7.6135,31.9495',
        geofabrikRegion: 'africa/morocco',
      },
    ]);
    expect(plan.skipped).toEqual([]);
  });

  it('never builds a destination whose pack is already published', async () => {
    const plan = await planWanted([BANGKOK, MARRAKECH], 6, (slug) =>
      Promise.resolve(slug === 'th-bangkok' ? 200 : 404),
    );
    expect(plan.build.map((entry) => entry.slug)).toEqual(['ma-marrakech']);
    expect(plan.skipped.map((entry) => entry.slug)).toEqual(['th-bangkok']);
  });

  it('leaves a destination alone when the tiles host gives no clear answer', async () => {
    const plan = await planWanted([BANGKOK], 6, () => Promise.resolve(503));
    expect(plan.build).toEqual([]);
    expect(plan.skipped[0]?.reason).toContain('503');
  });

  it('skips and names a box over the size cap', async () => {
    const wide = { slug: 'iceland', bounds: [-25, 63, -13, 67] };
    expect(boxKm2([-25, 63, -13, 67])).toBeGreaterThan(MAX_BOX_KM2);
    const plan = await planWanted([wide, BANGKOK], 6, none);
    expect(plan.build.map((entry) => entry.slug)).toEqual(['th-bangkok']);
    expect(plan.skipped).toEqual([
      { slug: 'iceland', reason: expect.stringContaining('over the 20000 km² cap') as string },
    ]);
  });

  it('skips a destination with no extract on record, and anything that is not a slug and a box', async () => {
    const plan = await planWanted(
      [
        { slug: 'zz-nowhere', bounds: [1, 1, 2, 2] },
        { slug: 'th-bangkok; rm -rf', bounds: [1, 1, 2, 2] },
        { slug: 'th-bangkok', bounds: [2, 1, 1, 2] },
        null,
      ],
      6,
      none,
    );
    expect(plan.build).toEqual([]);
    expect(plan.skipped).toHaveLength(4);
  });

  it('stops at the run limit', async () => {
    const plan = await planWanted([BANGKOK, MARRAKECH], 1, none);
    expect(plan.build.map((entry) => entry.slug)).toEqual(['th-bangkok']);
  });
});
