/**
 * What a nudge says back to its sender, as an island toast: when the guide will nudge (in the
 * crewmate's own time, "when they open things"), that it went to their inbox, or that the pair
 * nudged too recently. The relay has no toast: the share sheet is the answer.
 */
import type { I18n } from '@lingui/core';
import { msg } from '@lingui/core/macro';

import { format } from '@cp/i18n';

import { toast } from '@/motion/island-toast';

import type { NudgeOutcome } from './use-nudge';

export function nudgeToastTitle(i18n: I18n, outcome: NudgeOutcome): string | null {
  switch (outcome.kind) {
    case 'scheduled': {
      const { guide, name, at } = outcome;
      return i18n._(
        msg({
          id: 'home.nudge.scheduled',
          message: `${guide} will nudge ${name} at ${at}, when they open things.`,
        }),
      );
    }
    case 'inbox': {
      const { guide, name } = outcome;
      return i18n._(
        msg({ id: 'home.nudge.inbox', message: `${guide} left ${name} a nudge in their inbox.` }),
      );
    }
    case 'too_soon': {
      const when = format.time(i18n.locale, outcome.nextAt);
      return i18n._(
        msg({
          id: 'home.nudge.tooSoon',
          message: `You nudged them recently. Try again after ${when}.`,
        }),
      );
    }
    case 'failed':
      return i18n._(
        msg({ id: 'home.nudge.failed', message: "The nudge didn't go through. Try again." }),
      );
    case 'relay':
      return null;
  }
}

export function showNudgeToast(i18n: I18n, outcome: NudgeOutcome, id: string): void {
  const title = nudgeToastTitle(i18n, outcome);
  if (title !== null) toast.show({ id, title });
}
