import { describe, expect, it } from 'vitest';

import { readingMinutes, tipColour, tipFrontmatterSchema } from './schema';

const valid = {
  slug: 'how-to-get-six-friends-to-agree',
  title: 'How to get six friends to agree on where to go',
  summary: 'A shortlist of three, one deadline and a tie-break rule decided before anyone votes.',
  category: 'planning',
  guide_id: 'tokek',
  ai_assisted: true,
  published_at: '2026-09-24',
};

describe('tip frontmatter', () => {
  it('accepts a complete article and fills defaults', () => {
    const tip = tipFrontmatterSchema.parse(valid);
    expect(tip.published_at).toBeInstanceOf(Date);
    expect(tip.draft).toBe(false);
    expect(tip.bubbles).toEqual([]);
    expect(tipColour(tip)).toBe('green');
  });

  it('rejects unknown categories, bad slugs, a missing disclosure and stray keys', () => {
    expect(tipFrontmatterSchema.safeParse({ ...valid, category: 'food' }).success).toBe(false);
    expect(tipFrontmatterSchema.safeParse({ ...valid, slug: 'Bad Slug' }).success).toBe(false);
    const { ai_assisted: _drop, ...noDisclosure } = valid;
    expect(tipFrontmatterSchema.safeParse(noDisclosure).success).toBe(false);
    expect(tipFrontmatterSchema.safeParse({ ...valid, author: 'x' }).success).toBe(false);
  });

  it('counts reading time in words, not markup', () => {
    expect(readingMinutes('word '.repeat(1200))).toBe(6);
    expect(readingMinutes('<PullQuote by="me">short</PullQuote>')).toBe(1);
  });
});
