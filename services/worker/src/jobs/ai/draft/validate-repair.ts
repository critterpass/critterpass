/**
 * The check stage: the planner validates the whole draft, the guide redoes only the days that broke
 * a rule (two passes at most, those days in parallel), stops without a must-do give way before a
 * must-do does, and whatever still breaks a rule is dropped and shown as missing. Stops the
 * organiser placed by hand are then put back where she placed them (./held-stops.ts).
 */
import {
  groupPrefix,
  joinRepairs,
  repairGroup,
  validateAndRepair,
  type DayGroup,
  type DraftModel,
  type DraftPlanInput,
  type RepairOutcome,
} from '@cp/ai';
import type pg from 'pg';

import type { Drafted } from './fan-out';
import { eachGroup, groupProgress, type GroupProgress } from './group-progress';
import { holdStops, type HeldStop } from './held-stops';
import type { Outline } from './skeleton';

/** Each day group checked and repaired on its own places and hours, then joined. */
function repairGroups(
  model: DraftModel,
  groups: readonly DayGroup[],
  skeleton: Outline,
  drafted: Drafted,
  progress: GroupProgress | undefined,
): Promise<RepairOutcome> {
  return eachGroup(groups.length, progress, (index) => {
    const group = groups[index];
    const outline = skeleton.groups?.[index];
    const days = drafted.groups?.[index];
    if (group === undefined || outline === undefined || days === undefined) {
      throw new Error('draft: a day group has no outline or days');
    }
    return repairGroup(model, group, groupPrefix(groups, index), outline, days);
  }).then((outcomes) => joinRepairs(groups, outcomes));
}

/** Where the check step keeps each day group's result while it runs (./group-progress.ts). */
export function checkProgress(ctx: {
  readonly pool: pg.Pool;
  readonly agentJob: { readonly id: string };
}): GroupProgress {
  return groupProgress(ctx.pool, ctx.agentJob.id, 'validate');
}

export async function checkStage(
  model: DraftModel,
  input: DraftPlanInput,
  skeleton: Outline,
  drafted: Drafted,
  options: {
    readonly held?: readonly HeldStop[];
    readonly groups?: readonly DayGroup[] | undefined;
    readonly progress?: GroupProgress;
  } = {},
): Promise<RepairOutcome> {
  const { held = [], groups = [], progress } = options;
  const outcome =
    groups.length < 2
      ? await validateAndRepair(model, input, skeleton, drafted.itinerary)
      : await repairGroups(model, groups, skeleton, drafted, progress);
  // The planner was given her stops and planned around them. Putting them back here, exactly as
  // she placed them, is the guarantee that holds whatever happened above.
  return { ...outcome, itinerary: holdStops(outcome.itinerary, held, input.travel).itinerary };
}

/**
 * What the check stage leaves on the job row beside the draft itself: whether the first check was
 * clean, what each pass found (code, day and place of every broken rule), how many stops the
 * planner dropped or added itself, and what still breaks a rule. It explains a draft afterwards.
 */
export function keptWithJob(outcome: RepairOutcome) {
  return {
    first_ok: outcome.first.ok,
    first: { ok: outcome.first.ok, violations: [], costPpMinor: outcome.first.costPpMinor },
    loops: outcome.loops,
    dropped: outcome.dropped,
    left: outcome.final.violations.map((v) => v.code),
    passes: outcome.passes,
    filled: outcome.filled,
    notes_removed: outcome.notesRemoved,
    retitled: outcome.retitled,
    essentials_left_out: outcome.essentialsLeftOut,
  };
}
