/**
 * The pack of a guide nobody has written for yet, built from its critter's facts: its designed
 * name, its species, its city and country. It speaks as its city's own guide that is still
 * learning the place, in the hedged register of the guest guide, and never borrows another
 * guide's name, words or lines. A written pack replaces it once approved.
 */
import { nearestGuideColour, guideAccent, type GuideFacts } from '@cp/critter-art/guides';

import { REPO_PACKS } from './loader';
import { personaPackSchema, type PersonaPack } from './schema';

export const TEMPLATE_PACK_VERSION = 'template-1';

export function templatePersonaPack(facts: GuideFacts): PersonaPack {
  return personaPackSchema.parse({
    id: facts.slug,
    version: TEMPLATE_PACK_VERSION,
    status: 'draft',
    name: facts.name,
    species: facts.species,
    destination: `${facts.city}, ${facts.country}`,
    colour: nearestGuideColour(guideAccent(facts.slug, facts.colours)),
    voice_id: null,
    register: REPO_PACKS.guest.register,
    tagline: `${facts.city} is my city, and I’m still learning it.`,
    catchphrases: [],
    local_words: [],
    taboos: [
      'Never present a guess as local knowledge; say where a fact came from.',
      'Never recommend a small business, stall or eatery by name; say which street, market or area has the good ones.',
      'Never call yourself a guest or a stand-in, and never speak as or about another guide.',
    ],
    sign_off: null,
    chattiness: REPO_PACKS.guest.chattiness,
    guest_mode: null,
    learning: { hedge: `what ${facts.name} knows so far` },
  });
}
