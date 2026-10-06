/**
 * What the organiser's note asks of a redrafted day beyond the reason chips. The note is read once,
 * by a typed decision (`redraft.note_intent`, one yes/no per closed label), never by matching
 * words; the labels then drive the planner. "Less walking": the guide is told how much the day
 * walks now; the new day's walking is measured the same way, and when it has not come down the
 * summary says so instead of passing over what she asked. A slower pace and a later start count as
 * the chips of the same name. Rain or indoors puts places under a roof first (./redraft-rain.ts).
 * The other labels are kept for the record; the guide reads the note itself for them.
 */
import type { DraftDay, RedraftReasonKey } from '@cp/domain';
import { decisionBand } from '@cp/domain';
import { metresBetween } from '@cp/planner';

import type { DecisionClient } from '../../decide/client';
import {
  REDRAFT_NOTE_ASKS,
  redraftNoteQuestions,
  type RedraftNoteAsk,
} from '../../decide/questions';
import type { UsageContext } from '../../usage';
import type { RedraftPlanInput } from './redraft-input';

export const REDRAFT_NOTE_ROUTE = 'redraft.note_intent' as const;

/** Two stops this close are walked between (the plan screen's own threshold). */
const WALK_MAX_M = 1200;

/** The labels a note asks for; none when there is no note (or it says none of them). */
export async function readRedraftNote(
  decisions: Pick<DecisionClient, 'decide'>,
  note: string | null,
  usage: UsageContext = {},
): Promise<RedraftNoteAsk[]> {
  if (note === null || note.trim() === '') return [];
  const decision = await decisions.decide(
    REDRAFT_NOTE_ROUTE,
    { state: note, questions: redraftNoteQuestions() },
    usage,
  );
  const { yes } = decisionBand(REDRAFT_NOTE_ROUTE, decision.answered_by);
  return REDRAFT_NOTE_ASKS.filter((ask) => decision.answers[ask].noul >= yes);
}

/** Whether the organiser's note asks for a day with less walking. */
export function wantsLessWalking(input: Pick<RedraftPlanInput, 'asks'>): boolean {
  return input.asks?.includes('less_walking') === true;
}

/** The reason chips the organiser's note asks for in her own words (see the file header). */
export function noteReasons(asks: readonly RedraftNoteAsk[] | undefined): RedraftReasonKey[] {
  return [
    ...(asks?.includes('slower') === true ? (['slower'] as const) : []),
    ...(asks?.includes('later_start') === true ? (['later_start'] as const) : []),
  ];
}

/** The metres walked between the day's stops: every hop short enough to be a walk. */
export function walkedMetres(input: Pick<RedraftPlanInput, 'pois'>, day: DraftDay): number {
  let metres = 0;
  day.items.forEach((item, index) => {
    const before = day.items[index - 1];
    const a = before?.poi_id == null ? undefined : input.pois.get(before.poi_id);
    const b = item.poi_id === null ? undefined : input.pois.get(item.poi_id);
    if (a === undefined || b === undefined) return;
    const hop = metresBetween(a, b);
    if (hop <= WALK_MAX_M) metres += hop;
  });
  return Math.round(metres);
}

/** What the guide is told when she asked for less walking. */
export function lessWalkingTarget(input: RedraftPlanInput, day: DraftDay): string {
  const walks = day.items.filter((item, index) => {
    const before = day.items[index - 1];
    const a = before?.poi_id == null ? undefined : input.pois.get(before.poi_id);
    const b = item.poi_id === null ? undefined : input.pois.get(item.poi_id);
    return a !== undefined && b !== undefined && metresBetween(a, b) <= WALK_MAX_M;
  }).length;
  return `Less walking means less walking between stops than now (the day has ${walks} walks, about ${walkedMetres(input, day)} metres): take out or swap a stop that is reached on foot, or put a ride where a walk was. If you cannot, say so plainly in the summary.`;
}
