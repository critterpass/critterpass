/**
 * Planning and places in the worker (docs/api-contracts-async.md §2.2): every planning module's
 * jobs and event hooks, spread once into the job registry.
 *
 * Append-only and union-merged (.gitattributes): a planning module adds one import line and one
 * entry to PLANNING_JOB_FAMILIES, nothing else, so parallel branches never conflict here.
 */
import type { AnyJobDefinition } from '../../boss';
import type { JobRegistryDeps } from '../../job-registry';

/** One planning module's jobs, built from the registry's dependencies. */
export type PlanningJobFamily = (deps: JobRegistryDeps) => readonly AnyJobDefinition[];

const PLANNING_JOB_FAMILIES: readonly PlanningJobFamily[] = [
  // One entry per planning module.
];

export function planningJobs(deps: JobRegistryDeps): AnyJobDefinition[] {
  return PLANNING_JOB_FAMILIES.flatMap((family) => family(deps));
}
