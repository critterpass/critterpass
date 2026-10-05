/** Where an organiser's own plan is before the crew has one, read from the trip's status. */
export type DraftStage = 'building' | 'guideWorking' | 'review';

/** Where her own plan is, from the trip's status. */
export function draftStageOf(status: string): DraftStage {
  if (status === 'drafting' || status === 'redrafting') return 'guideWorking';
  return status === 'won' || status === 'setup' ? 'building' : 'review';
}
