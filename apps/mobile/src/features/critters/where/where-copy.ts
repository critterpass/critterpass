/** Where-to-find's words: the steps that take a form, in the active locale. */
import { plural, t } from '@lingui/core/macro';

import type { WhereStep } from './where-model';

export function whereTitle(): string {
  return t({ id: 'critters.where.title', message: 'Where to find it' });
}

export function whereEyebrow(tier: string): string {
  return t({ id: 'critters.where.eyebrow', message: `${tier} form` });
}

export function directions(): string {
  return t({ id: 'critters.where.directions', message: 'Directions' });
}

export function stepsLabel(): string {
  return t({ id: 'critters.where.steps', message: 'How to meet it' });
}

export function nearestSpot(name: string, away: string | null): string {
  return away === null
    ? t({ id: 'critters.where.nearest', message: `Nearest: ${name}` })
    : t({ id: 'critters.where.nearestAway', message: `Nearest: ${name} · ${away}` });
}

export function noSpots(): string {
  return t({
    id: 'critters.where.none',
    message: 'No place on the map for this one. The steps below are what it takes.',
  });
}

export function allFound(): string {
  return t({ id: 'critters.where.allFound', message: 'All found' });
}

export function spotsMapLabel(): string {
  return t({ id: 'critters.where.nearMap', message: 'Where critters live here' });
}

export function stepText(step: WhereStep, nearest: string | null): string {
  switch (step.kind) {
    case 'go':
      return nearest === null
        ? t({ id: 'critters.where.step.goAny', message: 'Go to one of the places on the map.' })
        : step.places > 1
          ? t({
              id: 'critters.where.step.goNearest',
              message: `Go to one of the places on the map. ${nearest} is the nearest.`,
            })
          : t({ id: 'critters.where.step.go', message: `Go to ${nearest}.` });
    case 'places':
      return t({
        id: 'critters.where.step.places',
        message: plural(step.n, {
          one: 'Spend time at one of the places on the map.',
          other: 'Spend time at # different places on the map. They can be on different days.',
        }),
      });
    case 'stay':
      return t({
        id: 'critters.where.step.stay',
        message: plural(step.minutes, {
          one: 'Stay about # minute there, with CritterPass open.',
          other: 'Stay about # minutes there, with CritterPass open.',
        }),
      });
    case 'solar':
      return step.when === 'by_sunrise'
        ? t({
            id: 'critters.where.step.sunrise',
            message: 'Be there around sunrise: from an hour before until just after.',
          })
        : t({ id: 'critters.where.step.dark', message: 'Be there after dark.' });
    case 'day': {
      const day =
        step.placeLine === null
          ? t({
              id: 'critters.where.step.dayAny',
              message: 'It only comes out on its day of the year.',
            })
          : t({
              id: 'critters.where.step.day',
              message: `It only comes out on its day: ${step.placeLine}.`,
            });
      return step.challenge === null ? day : `${day} ${step.challenge}`;
    }
    case 'together':
      return t({
        id: 'critters.where.step.together',
        message: `Be there together, at least ${step.members} of your crew at once.`,
      });
    case 'set_first':
      return t({
        id: 'critters.where.step.setFirst',
        message: plural(step.n, {
          one: 'First befriend # critter from this set.',
          other: 'First befriend # critters from this set.',
        }),
      });
  }
}
