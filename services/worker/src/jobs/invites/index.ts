/** Invite, code, waitlist, referral and share-card jobs, and the crew growth pushes they and the api trigger. */
import type { AnyJobDefinition } from '../../boss/define-job';
import { ogRenderJob, ogWebBaseUrl } from '../og/render';
import { referralEvaluateJob } from '../referrals/evaluate';
import { codeExpiryJob } from './expire';
import { inviteNudgeJob } from './nudge';
import { offerExpireJob } from './offer-expire';
import { waitlistOfferJob } from './waitlist-offer';

export { registerInviteNotifications } from './notifications';

export interface InviteJobsEnv {
  readonly APP_ENV: string;
  readonly WEB_BASE_URL?: string | undefined;
}

export function inviteJobs(env: InviteJobsEnv): AnyJobDefinition[] {
  return [
    ogRenderJob({ webBaseUrl: ogWebBaseUrl(env.APP_ENV, env.WEB_BASE_URL) }),
    codeExpiryJob(),
    waitlistOfferJob(),
    offerExpireJob(),
    inviteNudgeJob(),
    referralEvaluateJob(),
  ];
}
