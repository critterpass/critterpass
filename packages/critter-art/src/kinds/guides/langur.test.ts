import { describe, expect, it } from 'vitest';

import { createOpBuilder } from '../../core/ops';
import type { Op } from '../../core/ops';
import { ALL_POSES, fixtureOptions } from '../design-kind-fixture';
import type { FixtureOverrides } from '../design-kind-fixture';
import { resolveKind } from '../registry';
import { langur } from './langur';

const INK = '#221e19';

function draw(overrides: FixtureOverrides = {}, seed = 7): Op[] {
  const builder = createOpBuilder(seed, INK);
  langur(builder.sink, fixtureOptions(overrides));
  return builder.ops;
}

function colours(ops: readonly Op[]): Set<string> {
  return new Set(ops.map((op) => op.color));
}

function seeds(ops: readonly Op[]): number[] {
  return ops.flatMap((op) => ('seed' in op ? [op.seed] : []));
}

describe('langur', () => {
  it('is a registered, blinking guide kind in the 100x100 space', () => {
    const registration = resolveKind('langur');
    expect(registration.fn).toBe(langur);
    expect(registration.animates).toBe(true);
    expect(registration.viewBox).toEqual([100, 100]);
  });

  it.each(ALL_POSES)('draws pose=%s deterministically inside the frame', (pose) => {
    const ops = draw({ pose });
    expect(ops).toEqual(draw({ pose }));
    for (const op of ops) {
      for (const [x, y] of op.points) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(100);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(100);
      }
    }
  });

  it('wears the douc tells by default: orange face, red socks, white forearms, black hands', () => {
    const used = colours(draw());
    for (const colour of ['#ffb347', '#b8323a', '#fffaf0', '#3a3466', '#aea8c2', INK]) {
      expect(used).toContain(colour);
    }
  });

  it('recolours through the form palette slots', () => {
    const used = colours(
      draw({
        fill: '#111111',
        spot: '#222222',
        belly: '#333333',
        leaf: '#444444',
        stripe: '#555555',
        accent: '#666666',
      }),
    );
    for (const colour of ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666']) {
      expect(used).toContain(colour);
    }
    for (const colour of ['#ffb347', '#b8323a', '#fffaf0', '#3a3466', '#aea8c2']) {
      expect(used).not.toContain(colour);
    }
  });

  it.each(['wave', 'cheer', 'think', 'point'])('moves its arms for pose=%s', (pose) => {
    expect(draw({ pose })).not.toEqual(draw({ pose: 'idle' }));
  });

  it('draws an unknown pose as idle, apart from the shared flourishes', () => {
    expect(draw({ pose: 'crack' })).toEqual(draw({ pose: 'idle' }));
    expect(draw({})).toEqual(draw({ pose: 'idle' }));
  });

  it('closes its eyes for a blink and for sleep without shifting any later wobble', () => {
    const open = draw({ pose: 'idle' });
    const closed = draw({ pose: 'idle', closed: true });
    expect(closed).not.toEqual(open);
    expect(seeds(closed)).toEqual(seeds(open));
    expect(colours(closed)).not.toContain('#fffdf6');
    const asleep = draw({ pose: 'sleep' });
    expect(colours(asleep)).not.toContain('#fffdf6');
    expect(asleep.length).toBeGreaterThan(closed.length);
  });
});
