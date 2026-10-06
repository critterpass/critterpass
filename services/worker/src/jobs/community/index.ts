/** Community jobs: nightly rating counts, and tip moderation on the compliance check. */
import type { AnyJobDefinition } from '../../boss';
import { communityAggregateJob } from './aggregate';
import { registerRatingTipModeration } from './tip-moderate';

export { aggregateRatings } from './aggregate';
export { applyTipVerdict, RATING_TIP_CONTENT_KIND } from './tip-moderate';

export function communityJobs(): AnyJobDefinition[] {
  registerRatingTipModeration();
  return [communityAggregateJob()];
}
