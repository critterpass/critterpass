import { describe, expect, it } from 'vitest';

import { critters as dex } from '@cp/critter-art';

import '../src/kinds/critters';
import { critterValidators, inScript } from '../src/kinds/critters/validate';
import { validateCommitted } from '../src/pipeline';
import { runValidators } from '../src/validators/registry';

const pon = {
  id: 'cp-061',
  no: 61,
  set_code: 'jp',
  city: 'Kyoto',
  species: 'Tanuki',
  name: 'Pon',
  name_native: 'ポン',
  art_params: { k: 'tanuki' },
  canonical_seed: 7,
  note: 'Forages quietly in temple gardens under the moon.',
};

const check = (item: object) => runValidators('critters', [item], critterValidators).items[0];

describe('critter validators', () => {
  it('reads scripts', () => {
    expect(inScript('ポン', 'Jpan')).toBe(true);
    expect(inScript('Pon', 'Jpan')).toBe(false);
    expect(inScript('Κρι-κρι', 'Grek')).toBe(true);
  });

  it('pass a designed critter and fail name leaks, wrong scripts and moved ids', () => {
    expect(check(pon)?.severity).toBe('pass');
    expect(check({ ...pon, note: 'Pon forages at night.' })?.checks.map((c) => c.id)).toContain(
      'note-hides-name',
    );
    expect(check({ ...pon, name_native: null })?.checks.map((c) => c.id)).toContain(
      'native-script',
    );
    expect(check({ ...pon, set_code: 'cn', name_native: '庞' })?.checks.map((c) => c.id)).toContain(
      'dex-identity',
    );
    expect(check({ ...pon, name: 'Pikachu' })?.checks.map((c) => c.id)).toContain('ip-screen');
  });

  it('holds the latest committed critter batch to its validators, one item per dex entry', () => {
    // Each critters batch is the whole kind (publishing replaces it), so only the latest one can
    // ship; earlier batches predate critters added to the dex since.
    const latest = validateCommitted('critters').at(-1);
    expect(latest).toBeDefined();
    expect(latest?.report.severity, latest?.batchKey).not.toBe('fail');
    expect(latest?.report.items).toHaveLength(dex.length);
  });
});
