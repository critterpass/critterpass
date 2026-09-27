import { isGuideSpec } from '../data/types';
import type { Critter } from '../data/types';
import type { RenderSpec } from '../core/model';
import { DESIGNED_FORMS } from './designed';
import type { DesignedForm } from './designed';

/**
 * design's `critters.canonical_seed` default rule (phase open question 1): locals use their
 * CritterDex `no`; guides use `7` (design's own most frequently authored seed).
 */
export function canonicalSeed(critter: Critter): number {
  return isGuideSpec(critter.spec) ? 7 : critter.no;
}

/** The designed fixture for a critter + rarity (Tokek rare/epic/legendary, Pon legendary); `undefined` for the 148 critters the content factory has not authored a form for yet. */
export function findDesignedForm(critterId: string, rarity: DesignedForm['form']['rarity']): DesignedForm | undefined {
  return DESIGNED_FORMS.find((f) => f.critterId === critterId && f.form.rarity === rarity);
}

/**
 * Resolves a CritterDex entry into a ready-to-`build()` `RenderSpec`, defaulting `seed` to the
 * canonical rule above. Callers pass `form`/`variant`/`sticker`/`closedEyes` as needed — this only
 * fills in what every render of a given critter shares.
 */
export function resolveRenderSpec(critter: Critter, overrides: Partial<Omit<RenderSpec, 'kind'>> = {}): RenderSpec {
  return {
    kind: critter.id,
    seed: canonicalSeed(critter),
    ...overrides,
  };
}
