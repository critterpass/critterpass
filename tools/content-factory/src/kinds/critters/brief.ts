/**
 * Critter brief: one generation unit per place, carrying the place's design dex entries (stable
 * `cp-###` ids, design names, species, cities), its languages and writing system, and the place
 * brief from briefs/places/<code>.md when one exists.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { critters, isGuideSpec, places, type Critter } from '@cp/critter-art';

import { placeFacts } from '../../data/place-facts';
import { FACTORY_DIR } from '../../work';
import type { Brief, GenerationUnit } from '../types';

export interface CritterUnitInput {
  readonly place: string;
  readonly placeName: string;
  readonly languages: readonly string[];
  readonly script: string;
  readonly placeBrief: string | null;
  readonly critters: readonly {
    readonly id: string;
    readonly name: string;
    readonly species: string;
    readonly city: string;
    readonly guide: boolean;
  }[];
}

export function placeBrief(code: string): string | null {
  const file = path.join(FACTORY_DIR, 'briefs', 'places', `${code}.md`);
  return existsSync(file) ? readFileSync(file, 'utf8').trim() : null;
}

export function dexEntry(id: string): Critter {
  const critter = critters.find((entry) => entry.id === id);
  if (critter === undefined) throw new Error(`no dex entry ${id}`);
  return critter;
}

/** `--opt places=vn,jp` limits the batch to some places; the default is all 61. */
export function critterBrief(options: Readonly<Record<string, string>>): Brief {
  const wanted = options['places']?.split(',').map((code) => code.trim());
  const units: GenerationUnit[] = places
    .filter((place) => wanted === undefined || wanted.includes(place.code))
    .map((place) => {
      const facts = placeFacts(place.code);
      const input: CritterUnitInput = {
        place: place.code,
        placeName: place.name,
        languages: facts.languages,
        script: facts.script,
        placeBrief: placeBrief(place.code),
        critters: place.critterIds.map((id) => {
          const critter = dexEntry(id);
          return {
            id,
            name: critter.name,
            species: critter.species,
            city: critter.city,
            guide: isGuideSpec(critter.spec),
          };
        }),
      };
      return { id: place.code, input };
    });
  return { units };
}
