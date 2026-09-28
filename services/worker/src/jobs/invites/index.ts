/** Invite, code and waitlist jobs, and the crew growth pushes they and the api trigger. */
import type { AnyJobDefinition } from '../../boss/define-job';
import { codeExpiryJob } from './expire';
import { inviteNudgeJob } from './nudge';
import { offerExpireJob } from './offer-expire';
import { waitlistOfferJob } from './waitlist-offer';

export { registerInviteNotifications } from './notifications';

export function inviteJobs(): AnyJobDefinition[] {
  return [codeExpiryJob(), waitlistOfferJob(), offerExpireJob(), inviteNudgeJob()];
}
