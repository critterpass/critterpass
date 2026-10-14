/**
 * The critter of a base-set destination the nearest-critter rule could not settle (decision route
 * `destination.critter`, Jev with its fast-tier twin): Jev picks one of at most four candidate
 * critters, the same country's nearest first, from the destination's facts and each candidate's
 * home and distance. Jev never names a critter outside the list; an answer under the route's
 * confidence floor gives no critter, and the caller falls back to the globally nearest one.
 */
import { decisionBand } from '@cp/domain';

import type { DecisionClient } from '../../decide/client';
import { choice } from '../../decide/questions';
import type { UsageContext } from '../../usage';

export const DESTINATION_CRITTER_ROUTE = 'destination.critter' as const;

export interface CritterOption {
  readonly key: string;
  /** The critter's home (`Hội An`, `Borneo`). */
  readonly home: string;
  readonly country: string;
  readonly distanceKm: number;
}

export interface CritterDestination {
  readonly name: string;
  readonly country: string;
  readonly region: string | null;
  readonly kind: string;
}

export interface CritterChoice {
  /** null when the answer was under the confidence floor. */
  readonly critterKey: string | null;
  readonly confidence: number;
  readonly answeredBy: string;
  readonly costMicros: number;
}

export function destinationCritterQuestions(options: readonly CritterOption[]) {
  return {
    critter: choice(
      'Which local critter should guide travellers to this destination? Pick the critter whose ' +
        'home is the same area travellers would see as this place’s neighbour: the same region, ' +
        'island or coast, and on the same side of a border or a sea.',
      Object.fromEntries(
        options.map((option) => [
          option.key,
          `lives in ${option.home}, ${option.country}, ${Math.round(option.distanceKm)} km away`,
        ]),
      ) as Record<string, string>,
    ),
  };
}

export async function chooseDestinationCritter(
  decisions: Pick<DecisionClient, 'decide'>,
  destination: CritterDestination,
  options: readonly CritterOption[],
  usage: UsageContext = {},
): Promise<CritterChoice> {
  if (options.length < 2) throw new Error('a critter choice needs at least two options');
  const decision = await decisions.decide(
    DESTINATION_CRITTER_ROUTE,
    {
      state: {
        destination: destination.name,
        country: destination.country,
        region: destination.region,
        kind: destination.kind,
      },
      questions: destinationCritterQuestions(options),
    },
    usage,
  );
  const floor = decisionBand(DESTINATION_CRITTER_ROUTE, decision.answered_by).minConfidence;
  const { critter } = decision.answers;
  const known = options.some((option) => option.key === critter.choice);
  return {
    critterKey: known && critter.confidence >= floor ? critter.choice : null,
    confidence: critter.confidence,
    answeredBy: decision.answered_by,
    costMicros: decision.costMicros,
  };
}
