/**
 * What Ideas reads of the plan: the plan I see (the crew's, or my own draft before there is one,
 * which an organiser's first visit asks the server to give its days), its dated days for the
 * chips, each idea with where it would fit that plan, and what to say when there is no plan for me
 * to place anything on yet.
 */
import { useMemo } from 'react';

import { useDraftFits } from '@/data/ideas/use-draft-fits';
import { useTripIdeas } from '@/data/ideas/use-trip-ideas';
import { useEnsurePlanDays } from '@/data/plan/use-plan-days';
import { useTripPlan, type TripPlan } from '@/data/plan/use-trip-plan';

/** Who is putting the plan together, by first name; null when the crew row has not synced. */
export function organiserName(plan: Pick<TripPlan, 'crew'>): string | null {
  const row = plan.crew.find((member) => member.role === 'organiser');
  const first = (row?.display_name ?? '').trim().split(/\s+/u)[0] ?? '';
  return first === '' ? null : first;
}

export function useIdeasPlan(tripId: string) {
  const plan = useTripPlan(tripId, { version: 'draft-or-current' });
  useEnsurePlanDays(plan);
  const saved = useTripIdeas(tripId);
  const onDraft = plan.mode === 'draft';
  const draftFits = useDraftFits(
    tripId,
    saved.ideas.flatMap((idea) => (idea.poiId === null ? [] : [idea.poiId])),
    onDraft ? plan.versionId : null,
  );
  const ideas = useMemo(
    () =>
      saved.ideas.map((idea) => {
        const fit = idea.poiId === null ? undefined : draftFits.get(idea.poiId);
        return onDraft && fit !== undefined ? { ...idea, fit } : idea;
      }),
    [saved.ideas, draftFits, onDraft],
  );
  const days = useMemo(
    () =>
      plan.dayRows.flatMap((row) =>
        row.date === null ? [] : [{ dayNo: row.day_no, date: row.date }],
      ),
    [plan.dayRows],
  );
  return {
    plan,
    loaded: saved.loaded,
    ideas,
    days,
    /** The crew has a plan: the guide can place ideas on it (never on a private draft). */
    crewPlan: plan.mode === 'group' && plan.versionId !== null,
    /** No plan I can see yet (a member before the proposal): nothing can go onto a day. */
    beforePlan: plan.loaded && plan.versionId === null ? { organiser: organiserName(plan) } : null,
  };
}
