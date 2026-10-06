import { describe, expect, it } from '@jest/globals';
import type { RatingCard } from '@cp/domain';

import { rejectedTips, resumeIndex, verdictFor, withAnswers } from '../rate/rate-model';

const card = (poi: string, verdict: RatingCard['verdict'] = null): RatingCard => ({
  poi_id: poi,
  name: poi,
  category: 'temple_shrine',
  day_no: 1,
  verdict,
  tip: null,
  tip_status: 'none',
});

describe('rate model', () => {
  it('resumes at the first place without a verdict', () => {
    expect(resumeIndex([card('a', 'loved'), card('b'), card('c')])).toBe(1);
    expect(resumeIndex([card('a', 'fine')])).toBe(1);
  });

  it('sends no tip for a blank field and cuts a long one to the limit', () => {
    expect(verdictFor(card('a'), 'loved', '   ')).toEqual({ poi_id: 'a', verdict: 'loved' });
    expect(verdictFor(card('a'), 'skip', 'x'.repeat(250)).tip).toHaveLength(200);
  });

  it('marks a new tip as waiting for review until the server answers', () => {
    const answered = withAnswers(
      [card('a'), card('b')],
      new Map([['a', { poi_id: 'a', verdict: 'loved' as const, tip: 'Go early' }]]),
    );
    expect(answered[0]).toMatchObject({ verdict: 'loved', tip: 'Go early', tip_status: 'pending' });
    expect(answered[1]?.verdict).toBeNull();
  });

  it('finds the tips moderation turned down', () => {
    expect(
      rejectedTips([{ ...card('a', 'loved'), tip: 'x', tip_status: 'rejected' }, card('b')]),
    ).toHaveLength(1);
  });
});
