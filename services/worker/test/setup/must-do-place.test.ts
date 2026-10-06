/**
 * A typed must-do decided once, from answers recorded live from Jev: the place it means among our
 * search's candidates and the time of day its words ask for; a place not among them keeps it a
 * wish, and with no candidate at all only the time is asked. Only the title, the destination and
 * the candidates' names are sent.
 */
import { readFileSync } from 'node:fs';

import { createDecisionClient } from '@cp/ai';
import { describe, expect, it } from 'vitest';

import { resolveMustDo, type MustDoCandidate } from '../../src/jobs/ai/must-do-place';

const FUSHIMI: MustDoCandidate = {
  id: 'poi-fushimi',
  name: 'Fushimi Inari Taisha',
  nameLocal: '伏見稲荷大社',
  category: 'temple_shrine',
};

function replay(fixture: string) {
  const sent: Record<string, unknown>[] = [];
  const { response } = JSON.parse(
    readFileSync(new URL(`./fixtures/${fixture}.json`, import.meta.url), 'utf8'),
  ) as { response: { status: number; body: unknown } };
  const send = (_url: unknown, init?: RequestInit) => {
    sent.push(JSON.parse(init?.body as string) as Record<string, unknown>);
    return Promise.resolve(
      new Response(JSON.stringify(response.body), { status: response.status }),
    );
  };
  return {
    decisions: createDecisionClient({ apiKey: 'fixture-key', fetch: send }),
    sent,
  };
}

describe('a typed must-do decided when it is set', () => {
  it('picks the candidate it names and reads sunrise as early morning', async () => {
    const { decisions, sent } = replay('jev-must-do-fushimi-sunrise');
    const resolved = await resolveMustDo(decisions, {
      title: 'Fushimi Inari at sunrise',
      destination: 'Kyoto',
      candidates: [FUSHIMI],
    });
    expect(resolved).toEqual({ poiId: FUSHIMI.id, timeOfDay: 'early_morning' });
    expect(sent[0]?.['state']).toEqual({
      must_do: 'Fushimi Inari at sunrise',
      destination: 'Kyoto',
      candidates: {
        a: { name: FUSHIMI.name, local_name: FUSHIMI.nameLocal, category: 'temple_shrine' },
      },
    });
  });

  it('keeps a place not among the candidates a wish, with its time', async () => {
    const { decisions } = replay('jev-must-do-cho-dem-none');
    const resolved = await resolveMustDo(decisions, {
      title: 'ăn tối ở chợ đêm',
      destination: 'Kyoto',
      candidates: [FUSHIMI],
    });
    expect(resolved).toEqual({ poiId: null, timeOfDay: 'evening' });
  });

  it('asks only the time when our search found nothing', async () => {
    const { decisions, sent } = replay('jev-must-do-gion-night-walk');
    const resolved = await resolveMustDo(decisions, {
      title: 'a night walk in Gion',
      destination: 'Kyoto',
      candidates: [],
    });
    expect(resolved).toEqual({ poiId: null, timeOfDay: 'after_dark' });
    expect(Object.keys(sent[0]?.['questions'] as object)).toEqual(['time']);
  });
});
