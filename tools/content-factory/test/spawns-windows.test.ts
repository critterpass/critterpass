import { currentRelease, windowMonths } from '@cp/content';
import { describe, expect, it } from 'vitest';

import { insidePlace } from '../src/data/country-bounds';
import '../src/kinds/spawns';
import { toWindow } from '../src/kinds/windows';
import { committedItems } from '../src/committed';
import { validateCommitted } from '../src/pipeline';

const legendary = {
  formId: 'cp-013:legendary',
  name: 'Golden Léon',
  requirement: 'At the Fête des Lumières',
  city: 'Lyon',
  place: 'France',
  hits: [
    {
      url: 'https://www.fetedeslumieres.lyon.fr/en',
      title: 'Fête des Lumières',
      content: '5 to 8 December',
    },
  ],
};
const answer = {
  form_id: 'cp-013:legendary',
  id: 'golden-leon',
  place_line: 'Lyon · Fête des Lumières',
  type: 'annual_range' as const,
  start: '12-05',
  end: '12-08',
  month: null,
  part: null,
  solar: 'after_dark' as const,
  challenge: null,
  source_url: 'https://www.fetedeslumieres.lyon.fr/en',
};

describe('legendary windows', () => {
  it('keeps a dated window only when its link is one of the search results', () => {
    expect(toWindow(answer, legendary).rule).toEqual({
      type: 'annual_range',
      start: '12-05',
      end: '12-08',
    });
    const uncited = toWindow({ ...answer, source_url: 'https://example.com/made-up' }, legendary);
    expect(uncited.rule).toEqual({ type: 'any_day' });
    expect(uncited.challenge).toBe('At the Fête des Lumières');
  });

  it('commit the designed six exactly and cover every month', () => {
    const windows = committedItems('windows');
    for (const designed of currentRelease('windows')!.items) {
      expect(windows.find((w) => w.form_id === designed.form_id)).toEqual(designed);
    }
    expect(new Set(windows.flatMap((w) => [...windowMonths(w.rule)])).size).toBe(12);
  });
});

describe('spawn rules', { timeout: 60_000 }, () => {
  it('place geofences inside their country', () => {
    expect(insidePlace('jp', 35.0036, 135.7785)).toBe(true);
    expect(insidePlace('jp', -35.0036, 135.7785)).toBe(false);
    expect(insidePlace('us', 21.3069, -157.8583)).toBe(true);
  });

  it('reach every committed form, and the latest committed batch validates', () => {
    const forms = committedItems('forms');
    const ruled = new Set(committedItems('spawns').map((rule) => rule.form_id));
    expect(forms.filter((form) => !ruled.has(form.id))).toEqual([]);
    // Each spawns batch is the whole kind (publishing replaces it), so only the latest one can
    // ship; an earlier one predates forms added since (it has no rule for them).
    const latest = validateCommitted('spawns').at(-1);
    expect(latest?.report.severity, latest?.batchKey).not.toBe('fail');
  });

  it('give a Đà Nẵng trip critters to meet: its guide on Sơn Trà and locals around the city', () => {
    const daNang = committedItems('spawns').filter((rule) => rule.destination === 'da-nang');
    expect(new Set(daNang.map((rule) => rule.form_id.slice(0, 6)))).toEqual(
      new Set(['cp-151', 'cp-005', 'cp-002', 'cp-006', 'cp-007', 'cp-009', 'cp-010']),
    );
    // The city and Sơn Trà spots sit inside the destination's own area
    // (packages/db/seed/destinations.ts); Hội An's coconut village is a kilometre past its edge.
    for (const rule of daNang.filter((r) => !r.form_id.startsWith('cp-005'))) {
      for (const g of rule.geofences) {
        expect(g.lng, g.label).toBeGreaterThanOrEqual(107.95);
        expect(g.lng, g.label).toBeLessThanOrEqual(108.36);
        expect(g.lat, g.label).toBeGreaterThanOrEqual(15.84);
        expect(g.lat, g.label).toBeLessThanOrEqual(16.21);
      }
    }
  });
});
