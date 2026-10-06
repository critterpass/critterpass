import { describe, expect, it } from 'vitest';

import {
  socialSetLocales,
  socialSets,
  socialTemplates,
} from '../../../packages/content/src/social/index';
import { pngInfo } from '../store-kit/png';
import { BODY_FONT, HEADLINE_FONT, measurer, renderOpaquePng } from '../store-kit/render';
import { socialBatch, socialCard } from './render';

const [set] = socialSets();
if (set === undefined) throw new Error('no social sets');

describe('social kit', { timeout: 120_000 }, () => {
  const measure = { headline: measurer(HEADLINE_FONT), body: measurer(BODY_FONT) };

  it('renders the set in the languages it is fully written in, and no other', () => {
    expect(socialSetLocales(set)).toEqual(['en', 'vi']);
    expect(socialSetLocales(set, ['vi'])).toEqual(['vi']);
    expect(() => socialSetLocales(set, ['ja'])).toThrow(/not written in ja/u);
    const [first, ...rest] = set.items;
    const half = { ...set, items: [{ ...first!, copy: { en: first!.copy.en! } }, ...rest] };
    expect(socialSetLocales(half)).toEqual(['en']);
  });

  it('makes a square post and a story per critter, each with alt text', () => {
    for (const locale of socialSetLocales(set)) {
      const cards = socialBatch(set, locale, measure);
      expect(cards.map((entry) => entry.file)).toEqual(
        set.items.flatMap((item) => [
          `${item.critter}-post-square.png`,
          `${item.critter}-story.png`,
        ]),
      );
      expect(cards.every((entry) => entry.alt.length > 0)).toBe(true);
    }
  });

  it('keeps a story inside the bands the platform covers', () => {
    const story = socialTemplates().find((template) => template.id === 'story')!;
    const { layout } = socialCard(set, set.items[0]!, story, 'vi', measure);
    for (const node of layout.nodes) {
      expect(node.y).toBeGreaterThanOrEqual(story.safe.top);
      expect(node.y).toBeLessThan(story.height - story.safe.bottom);
    }
  });

  it('refuses a critter the dex does not have', () => {
    const [template] = socialTemplates();
    const stranger = { ...set.items[0]!, critter: 'cp-999' };
    expect(() => socialCard(set, stranger, template!, 'en', measure)).toThrow(/not in the dex/u);
  });

  it('draws each card at its template size with no alpha', async () => {
    for (const entry of socialBatch(set, 'vi', measure).slice(0, 2)) {
      const info = pngInfo(await renderOpaquePng(entry.layout));
      expect(info).toEqual({ width: entry.width, height: entry.height, alpha: false });
    }
  });
});
