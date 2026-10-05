/**
 * NOT SURE YET's words that depend on what was picked: the guide's line when nothing can move, by
 * reason (the plan and the dates are not about cost), and the name of the time "ask me later"
 * lands.
 */
import type { PrivateReason } from '@cp/domain';
import { t } from '@lingui/core/macro';

import type { FollowUp } from './options';

/** What the guide says when the cost engine has nothing to move, by the reason picked. */
export function nothingLine(reason: PrivateReason | null, organiser: string): string {
  switch (reason) {
    case 'plan':
      return t({
        id: 'proposal.objection.nothingPlan',
        message: `Tell ${organiser} which part. Open the plan and leave a note on the stop, or say it in the crew chat.`,
      });
    case 'dates':
      return t({
        id: 'proposal.objection.nothingDates',
        message: `The dates are ${organiser}’s to move. Say in the crew chat which days work for you.`,
      });
    case 'cost':
      return t({
        id: 'proposal.objection.nothing',
        message: 'Nothing here moves the cost for just you. You can still take your time.',
      });
    case 'other':
    case null:
      return t({
        id: 'proposal.objection.nothingOther',
        message: `Say it in the crew chat, or to ${organiser}. You can still take your time.`,
      });
  }
}

export function laterLabel(later: FollowUp): string {
  switch (later.when) {
    case 'tonight':
      return t({
        id: 'proposal.objection.laterTonight',
        message: 'Still thinking. Ask me tonight',
      });
    case 'tomorrow':
      return t({
        id: 'proposal.objection.laterTomorrow',
        message: 'Still thinking. Ask me tomorrow morning',
      });
    case 'sunday':
      return t({ id: 'proposal.objection.later', message: 'Still thinking. Ask me on Sunday' });
  }
}
