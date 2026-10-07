/**
 * The phrase practice quest counts distinct phrases practised in its language by the crew during
 * the quest day: five different phrases reach a target of five, and repeats, other languages,
 * other trips and people outside the audience move nothing.
 */
import type pg from 'pg';
import { describe, expect, it } from 'vitest';

import {
  matchPhrasePractice,
  phrasePracticeTemplate,
} from '../../../src/jobs/quests/templates/phrase-practice';
import type { QuestRow } from '../../../src/jobs/quests/templates/registry';

const TRIP = '0199a000-0000-7000-8000-000000000001';
const ME = '0199a000-0000-7000-8000-0000000000aa';
const quest: QuestRow = {
  id: '0199a000-0000-7000-8000-000000000002',
  trip_id: TRIP,
  template: 'phrase_practice',
  params: { n: 5, language: 'id' },
  target: 5,
  starts_at: new Date('2026-10-14T00:00:00Z'),
  day_start: new Date('2026-10-14T00:00:00Z'),
  ends_at: new Date('2026-10-14T23:59:59Z'),
};
const tx = {} as pg.PoolClient;

function practised(
  phrase: string,
  over: Record<string, unknown> = {},
  at = '2026-10-14T09:00:00Z',
) {
  return matchPhrasePractice({
    tx,
    quest,
    audience: new Set([ME]),
    event: {
      id: `event-${phrase}`,
      type: 'phrase.practised',
      trip_id: TRIP,
      occurred_at: new Date(at),
      payload: { phrase_id: phrase, trip_id: TRIP, user_id: ME, language: 'id', ...over },
    },
  });
}

describe('phrase practice quest', () => {
  it('reaches its target with five different phrases, counting a repeat once', async () => {
    const keys = new Set<string>();
    for (const phrase of ['p1', 'p2', 'p2', 'p3', 'p4', 'p5']) {
      const result = await practised(phrase);
      if (result !== null && 'key' in result) keys.add(result.key);
    }
    expect(keys.size).toBe(phrasePracticeTemplate.target({ n: 5, language: 'id' }, {} as never));
  });

  it('counts a regional variant of the language', async () => {
    expect(await practised('p1', { language: 'id-ID' })).toEqual({ key: 'p1' });
  });

  it.each([
    ['another language', { language: 'vi' }, undefined],
    ['another trip', { trip_id: '0199a000-0000-7000-8000-00000000ffff' }, undefined],
    ['someone outside the quest', { user_id: '0199a000-0000-7000-8000-0000000000bb' }, undefined],
    ['a practice after the quest day', {}, '2026-10-15T01:00:00Z'],
  ])('ignores %s', async (_label, over, at) => {
    expect(await practised('p1', over, at)).toBeNull();
  });

  it('accepts one to ten phrases and nothing else', () => {
    expect(phrasePracticeTemplate.params.safeParse({ n: 5, language: 'id' }).success).toBe(true);
    expect(phrasePracticeTemplate.params.safeParse({ n: 0, language: 'id' }).success).toBe(false);
    expect(phrasePracticeTemplate.params.safeParse({ n: 5, language: 'Bahasa' }).success).toBe(
      false,
    );
  });
});
