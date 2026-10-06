/**
 * A redraft note read by the typed decision, from answers recorded live from Jev: Vietnamese with
 * and without its accents, English, Japanese and French. Each phrasing gives exactly the labels
 * the planner acts on, and a note that asks for none of them ("more temples", "to buy" typed
 * without accents) gives none.
 */
import { describe, expect, it } from 'vitest';

import { createDecisionClient, readRedraftNote, type RedraftNoteAsk } from '../src';
import { fixtureTransport } from './fixture-transport';

const read = async (fixture: string, note: string) => {
  const jev = fixtureTransport([`jev-redraft-note-${fixture}`], { dir: 'typesafe' });
  const decisions = createDecisionClient({ apiKey: 'fixture-key', fetch: jev.fetch });
  const asks = await readRedraftNote(decisions, note);
  return { asks, request: jev.requests[0] };
};

const CASES: readonly (readonly [string, string, readonly RedraftNoteAsk[]])[] = [
  ['cham-hon', 'cham hon', ['slower']],
  ['cham-hon-it-di-bo', 'chậm hơn, ít đi bộ', ['slower', 'less_walking']],
  ['ngu-nuong', 'ngày cuối cho mình ngủ nướng, đi muộn một chút', ['slower', 'later_start']],
  ['troi-mua-trong-nha', 'Hom do troi hay mua, cho minh cho trong nha', ['indoor']],
  ['mua-dac-san', 'muon mua dac san o cho', []],
  ['bot-di-bo', 'them mot quan ca phe view dep, bot di bo', ['less_walking']],
  ['sleep-in-relaxed', 'Let us sleep in, then something relaxed', ['slower', 'later_start']],
  ['rain-indoors', 'It will rain all day, something indoors please', ['indoor']],
  ['pack-more-in', "We're bored, pack more into the day", ['faster']],
  ['free-things', 'Free things only if possible.', ['cheaper']],
  ['swap-museum', 'Swap the museum for something else', ['swap_stop']],
  ['more-temples', 'more temples please', []],
  ['ja-yukkuri-osome', 'ゆっくりしたいです。朝は遅めに始めたい', ['slower', 'later_start']],
  ['fr-plus-tot', 'On aimerait commencer plus tôt le matin', ['earlier_start']],
];

describe('a redraft note read by Jev', () => {
  it.each(CASES)('%s gives its labels', async (fixture, note, labels) => {
    const { asks, request } = await read(fixture, note);
    expect(asks).toEqual(labels);
    // Only the note itself is sent, with one yes/no per label.
    expect(request?.['state']).toBe(note);
    expect(Object.keys(request?.['questions'] as object).sort()).toEqual([
      'cheaper',
      'earlier_start',
      'faster',
      'indoor',
      'later_start',
      'less_walking',
      'slower',
      'swap_stop',
    ]);
  });

  it('asks nothing of an empty note', async () => {
    const jev = fixtureTransport([], { dir: 'typesafe' });
    const decisions = createDecisionClient({ apiKey: 'fixture-key', fetch: jev.fetch });
    expect(await readRedraftNote(decisions, null)).toEqual([]);
    expect(await readRedraftNote(decisions, '  ')).toEqual([]);
    expect(jev.requests).toHaveLength(0);
  });
});
