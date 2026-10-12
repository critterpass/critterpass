/** Why SEND is off in the builder, in the organiser's words; null when it can go. */
import { t } from '@lingui/core/macro';

import type { sendPlan } from './model';

export function blockedReason(plan: ReturnType<typeof sendPlan>): string | null {
  if (plan.kind !== 'blocked') return null;
  switch (plan.reason) {
    case 'no_recipients':
      return t({
        id: 'proposal.build.noRecipients',
        message: 'Invite someone to the crew first. There’s nobody to send it to yet.',
      });
    case 'offline_build':
      return t({
        id: 'proposal.build.offline',
        message: 'You’re offline. The guide needs a connection to rewrite the versions.',
      });
    case 'sent':
      return t({ id: 'proposal.build.alreadySent', message: 'This proposal is already out.' });
  }
}
