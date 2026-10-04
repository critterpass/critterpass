/** Why a stop can't go where it was dropped, in the guide's plain words (undesigned toast). */
import { t } from '@lingui/core/macro';

import type { Refusal } from './reschedule';

export function refusalLine(refusal: Refusal): string {
  switch (refusal.kind) {
    case 'pinned': {
      const stop = refusal.stop.title;
      return refusal.stop.lock === 'booking'
        ? t({
            id: 'plan.dayPlan.refused.booked',
            message: `${stop} is booked, so it keeps its time.`,
          })
        : t({ id: 'plan.dayPlan.refused.pinned', message: `${stop} is pinned to its time.` });
    }
    case 'runs_into': {
      const stop = refusal.stop.title;
      return t({
        id: 'plan.dayPlan.refused.runsInto',
        message: `That order runs into ${stop}, which keeps its time.`,
      });
    }
    case 'too_late':
      return t({ id: 'plan.dayPlan.refused.late', message: 'That order runs past midnight.' });
    case 'untimed': {
      const stop = refusal.stop.title;
      return t({ id: 'plan.dayPlan.refused.untimed', message: `${stop} needs a time first.` });
    }
    case 'read_only':
      return t({
        id: 'plan.dayPlan.refused.readOnly',
        message: 'This plan can’t be changed here.',
      });
  }
}
