import { critters } from '@cp/critter-art';
import { PUBLIC_LOCAL_SILHOUETTES, publicLocalsSchema } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import type { Translate } from '../site/i18n';
import { localSilhouettes, localsWords, SILHOUETTE_STAND_INS } from './locals-facts';

const t: Translate = (descriptor, values) =>
  `${descriptor.id}${values === undefined ? '' : JSON.stringify(values)}`;

const kyoto = publicLocalsSchema.parse({
  kind: 'locals',
  slug: 'jp-kyoto',
  name: 'Kyoto',
  area: 'Japan',
  photo: null,
  count: 3,
  critters: [
    { rarity: 'legendary', silhouette: 'sit' },
    { rarity: 'common', silhouette: 'bird' },
    { rarity: 'common', silhouette: 'sit' },
  ],
});

describe('locals page facts', () => {
  it('draws every body shape from a stand-in critter of that shape', () => {
    for (const shape of PUBLIC_LOCAL_SILHOUETTES) {
      const standIn = critters.find((critter) => critter.id === SILHOUETTE_STAND_INS[shape]);
      expect(standIn?.spec, shape).toMatchObject({ b: shape });
    }
  });

  it('gives two critters of one shape the same outline, whatever they are', () => {
    const [first, , third] = localSilhouettes(kyoto, t);
    expect(first?.kind).toBe(third?.kind);
    expect(first?.rarity).toBe('legendary');
  });

  it('counts the critters and their tiers, rarest first', () => {
    const words = localsWords(kyoto, t);
    expect(words.count).toBe('web.locals.count{"count":3}');
    expect(words.chips).toEqual(['1 web.locals.rarity.legendary', '2 web.locals.rarity.common']);
    expect(words.headline).toBe('Kyoto');
  });

  it('refuses a projection that carries more than the page may show', () => {
    const named = { ...kyoto, critters: [{ rarity: 'rare', silhouette: 'sit', name: 'Pon' }] };
    expect(publicLocalsSchema.safeParse(named).success).toBe(false);
    expect(publicLocalsSchema.safeParse({ ...kyoto, finders: ['maya'] }).success).toBe(false);
  });
});
