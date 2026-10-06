import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CREWS, planInput } from '../evals/draft/cases';
import { jsonResponse } from '../evals/lib/transports';
import { createGateway } from '../src/client';
import type { DraftModel, DraftPlanInput } from '../src/prompts/draft/context';
import { runGroupedDraftPlan, type DayGroup } from '../src/prompts/draft/groups';
import { runDraftPlan } from '../src/prompts/draft/pipeline';

const FIXTURES = resolve(fileURLToPath(new URL('.', import.meta.url)), '../evals/draft/fixtures');

interface Recorded {
  readonly calls: Readonly<Record<string, { readonly status: number; readonly body: unknown }>>;
}

const recording = (caseId: string): Recorded =>
  JSON.parse(readFileSync(resolve(FIXTURES, `${caseId}.json`), 'utf8')) as Recorded;

const reply = (text: string) => ({
  id: 'msg',
  type: 'message',
  role: 'assistant',
  model: 'replay',
  content: [{ type: 'text', text }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 1, output_tokens: 1 },
});

/**
 * The model at its network edge: each call is served from the recording of the case its key's
 * prefix names (`g2:day-1` from the second case's `day-1`), and every key asked is kept in order.
 */
function replayModel(byPrefix: Readonly<Record<string, Recorded | 'empty-days'>>) {
  const keys: string[] = [];
  const model: DraftModel = {
    call: (route, input, key) => {
      keys.push(key);
      const prefix = /^g\d+:/u.exec(key)?.[0] ?? '';
      const source = byPrefix[prefix];
      const own = key.slice(prefix.length);
      const body = source === 'empty-days' ? reply('{"stops": []}') : source?.calls[own]?.body;
      if (body === undefined) throw new Error(`no recorded call ${key}`);
      return createGateway({
        apiKey: 'replay',
        fetch: () => Promise.resolve(jsonResponse(body)),
        maxAttempts: 1,
      }).callModel(route, input);
    },
  };
  return { model, keys };
}

const crew = (id: string) => {
  const found = CREWS.find((c) => c.id === id);
  if (found === undefined) throw new Error(`no golden crew ${id}`);
  return found;
};

const group = (input: DraftPlanInput, dayNos: number[], extra: Partial<DayGroup> = {}) => ({
  destinationId: input.destination,
  dayNos,
  input,
  ...extra,
});

describe('a trip planned in day groups', { timeout: 60_000 }, () => {
  it('plans a one-group trip exactly as the one-destination workflow, with the same calls', async () => {
    const input = planInput(crew('kyoto-2'));
    const alone = replayModel({ '': recording('kyoto-2') });
    const grouped = replayModel({ '': recording('kyoto-2') });
    const expected = await runDraftPlan(alone.model, input);
    const actual = await runGroupedDraftPlan(grouped.model, [group(input, [1, 2])]);
    expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
    expect(grouped.keys).toEqual(alone.keys);
  });

  it('plans each group from its own places under the trip day numbers', async () => {
    const first = planInput(crew('kyoto-2'));
    const second = { ...planInput(crew('lisbon-2')), idFor: first.idFor };
    const { model, keys } = replayModel({
      '': recording('kyoto-2'),
      'g2:': recording('lisbon-2'),
    });
    const result = await runGroupedDraftPlan(model, [group(first, [1, 2]), group(second, [3, 4])]);
    expect(result.itinerary.days.map((day) => day.day_no)).toEqual([1, 2, 3, 4]);
    const placesOf = (days: number[]) =>
      new Set(
        result.itinerary.days
          .filter((day) => days.includes(day.day_no))
          .flatMap((day) =>
            day.items.flatMap((item) => (item.poi_id === null ? [] : [item.poi_id])),
          ),
      );
    for (const id of placesOf([1, 2])) expect(first.pois.has(id)).toBe(true);
    for (const id of placesOf([3, 4])) expect(second.pois.has(id)).toBe(true);
    const ids = result.itinerary.days.flatMap((day) => day.items.map((item) => item.stable_id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(keys.filter((key) => key.startsWith('g2:'))).toContain('g2:skeleton');
    expect(result.input.pois.size).toBe(first.pois.size + second.pois.size);
    expect(result.skeleton.days.map((day) => day.dayNo)).toEqual([1, 2, 3, 4]);
  });

  it('outlines a day trip in code and has its one day written by the guide', async () => {
    const city = planInput(crew('kyoto-2'));
    const kyoto = planInput(crew('kyoto-5'));
    const area = {
      ...kyoto,
      frame: { ...kyoto.frame, dates: kyoto.frame.dates.slice(2, 3), mustDos: [] },
    };
    const { model, keys } = replayModel({ '': recording('kyoto-2'), 'g2:': 'empty-days' });
    const result = await runGroupedDraftPlan(model, [
      group(city, [1, 2]),
      group(area, [3], { dayTrip: { name: 'Nara' } }),
    ]);
    expect(keys.filter((key) => key.startsWith('g2:'))).not.toContain('g2:skeleton');
    expect(keys).toContain('g2:day-1');
    expect(result.skeleton.days.find((day) => day.dayNo === 3)?.theme).toBe('Nara');
    expect(result.itinerary.days.map((day) => day.day_no)).toEqual([1, 2, 3]);
  });
});
