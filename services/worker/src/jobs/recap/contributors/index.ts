/**
 * The recap contributor registry: the builder runs every contributor here, in order, over one
 * draft. A later area (the album's photo counts, say) adds its data by registering a contributor,
 * without touching the builder. Order matters only where a contributor reads another's output:
 * rides annotate the plan's legs, visits count travellers at the plan's before-sunrise stops.
 */
import { crittersContributor } from './critters';
import { ledgerContributor } from './ledger';
import { planContributor } from './plan';
import { ridesContributor } from './rides';
import type { RecapContributor } from './types';
import { visitsContributor } from './visits';

const contributors: RecapContributor[] = [
  planContributor,
  ridesContributor,
  ledgerContributor,
  crittersContributor,
  visitsContributor,
];

/** Adds a contributor after the built-in ones; a name registers once. */
export function registerRecapContributor(contributor: RecapContributor): void {
  if (contributors.some((known) => known.name === contributor.name)) {
    throw new Error(`recap contributor already registered: ${contributor.name}`);
  }
  contributors.push(contributor);
}

export function recapContributors(): readonly RecapContributor[] {
  return contributors;
}

export type { RecapContributor, RecapDeps, RecapDraft, RecapScope, RecapTrip } from './types';
