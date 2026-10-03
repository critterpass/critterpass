/**
 * The template recap copy: plain lines built from the same facts the guide sees, used whenever the
 * model fails, declines or answers out of bounds, so a recap is never without words and never
 * shows a number the facts do not hold. Award titles are neutral and evidence-only.
 */
import type { AwardKind, RecapCard, RecapCardCopy, RecapCardsCopy } from '@cp/domain';

import type { RecapAwardCopy, RecapCopyAward, RecapCopyFacts, RecapCopyInput } from './schema';

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

function cardCopy(card: RecapCard, facts: RecapCopyFacts, awards: number): RecapCardCopy {
  const { route, receipt, critters } = facts;
  const about = route.estimated ? 'about ' : '';
  switch (card) {
    case 'cover':
      return {
        narration: `${plural(facts.days, 'day', 'days')} in ${facts.place}, ${plural(facts.travellers, 'traveller', 'travellers')}. Here's how it went.`,
        headline: facts.place,
      };
    case 'critters':
      return {
        narration:
          critters.forms_found === 0
            ? 'No new locals this time. They will still be here next trip.'
            : `${plural(critters.forms_found, 'form', 'forms')} found, ${plural(critters.new_critters, 'new local', 'new locals')} met.`,
      };
    case 'route':
      return {
        narration:
          route.stops.length < 2
            ? `One base, ${facts.place}, all trip.`
            : `${route.estimated ? 'About ' : ''}${route.km} km, ${plural(route.stops.length, 'stop', 'stops')}, one crew.`,
        ...(route.longest_leg === null
          ? {}
          : {
              line: `Longest leg: ${route.longest_leg.from} to ${route.longest_leg.to}, ${about}${route.longest_leg.km} km.`,
            }),
      };
    case 'awards':
      return { narration: `${plural(awards, 'award', 'awards')}, one for each of you.` };
    case 'receipt':
      return {
        narration:
          receipt.expenses === 0
            ? 'Nothing went on the receipt this trip.'
            : `${receipt.total} all in, ${receipt.each} each.`,
        line: receipt.settled ? 'Everyone is square.' : `${receipt.still_owed} still to settle.`,
      };
    case 'got_away': {
      const gotAway = facts.got_away;
      if (gotAway === null) return { narration: 'Nothing got away this time.' };
      const back = gotAway.comes_back === null ? '' : ` It comes back in ${gotAway.comes_back}.`;
      return {
        narration:
          gotAway.sightings === 0
            ? `One ${gotAway.rarity} stayed out of sight all trip.`
            : `Seen ${plural(gotAway.sightings, 'time', 'times')}, befriended by nobody.`,
        line: `The one that got away.${back}`,
      };
    }
    case 'stamp':
      return { narration: `${facts.place} is stamped on your pass, signed by the crew.` };
    case 'postcard':
      return {
        narration: `Greetings from ${facts.place}.`,
        line: `${facts.place}, ${plural(facts.days, 'day', 'days')}. Same time next year?`,
      };
  }
}

const AWARD_TEMPLATES: Readonly<
  Record<AwardKind, { readonly title: string; readonly line: (award: RecapCopyAward) => string }>
> = {
  treasurer: {
    title: 'The treasurer',
    line: (a) => `Logged ${plural(a.value, 'expense', 'expenses')}.`,
  },
  planner: { title: 'The planner', line: (a) => `${plural(a.value, 'plan edit', 'plan edits')}.` },
  early_riser: {
    title: 'Earliest riser',
    line: (a) =>
      a.evidence['earliest_time'] === undefined
        ? `Up for ${plural(a.value, 'early start', 'early starts')}.`
        : `Up and out by ${String(a.evidence['earliest_time'])}.`,
  },
  critter_whisperer: {
    title: 'Critter whisperer',
    line: (a) => `${plural(a.value, 'find', 'finds')} on this trip.`,
  },
  explorer: {
    title: 'The explorer',
    line: (a) => `${plural(a.value, 'place', 'places')} visited.`,
  },
  best_find: {
    title: 'Best find',
    line: (a) =>
      a.evidence['poi_name'] === undefined
        ? `Back ${plural(a.value, 'time', 'times')} to one favourite.`
        : `${String(a.evidence['poi_name'])}, ${plural(a.value, 'visit', 'visits')}.`,
  },
  navigator: {
    title: 'The navigator',
    line: (a) => `${plural(a.value, 'ride', 'rides')} logged.`,
  },
  human_camera: {
    title: 'Human camera',
    line: (a) => `${plural(a.value, 'photo', 'photos')} in the album.`,
  },
  good_company: { title: 'Good company', line: () => 'Along for every bit of it.' },
};

export function templateAwardCopy(awards: readonly RecapCopyAward[]): RecapAwardCopy[] {
  return awards.map((award) => {
    const template = AWARD_TEMPLATES[award.award];
    return { user_id: award.user_id, title: template.title, line: template.line(award) };
  });
}

export function templateRecapCopy(input: RecapCopyInput): {
  readonly cards: RecapCardsCopy;
  readonly awards: RecapAwardCopy[];
} {
  const cards: Record<string, RecapCardCopy> = {};
  for (const card of input.cards) cards[card] = cardCopy(card, input.facts, input.awards.length);
  return { cards: cards, awards: templateAwardCopy(input.awards) };
}
