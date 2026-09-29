/** Why a redraft did not go, in the guide's plain words (never the wire code). */
import { t } from '@lingui/core/macro';

import type { RedraftOutcome } from '../data/redraft-request';

export function outcomeLine(outcome: RedraftOutcome): string | null {
  switch (outcome.kind) {
    case 'conflict':
      return t({
        id: 'planDraft.redraft.conflict',
        message: 'Your draft changed since you opened this. Check the day and ask again.',
      });
    case 'open':
      return t({
        id: 'planDraft.redraft.open',
        message: 'Another redraft is still waiting for you. Keep it or put it back first.',
      });
    case 'busy':
      return t({
        id: 'planDraft.redraft.busy',
        message: 'I need a breather. Ask me again in a little while.',
      });
    case 'offline':
      return t({
        id: 'planDraft.redraft.offline',
        message: 'Redrafting needs signal. Nothing was used up.',
      });
    case 'failed':
      return t({
        id: 'planDraft.redraft.failed',
        message: 'That didn’t go through. Nothing was used up.',
      });
    case 'spent':
    case 'started':
      return null;
  }
}
