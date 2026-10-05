/** The day plan's back, worded for where it goes (./back-to-trip.ts). */
import { t } from '@lingui/core/macro';

import type { BackTarget } from './back-to-trip';

/** Back names where it goes: the trip (its map or hub), the draft, today, or just back. */
export function backLabel(target: BackTarget): string {
  switch (target) {
    case 'draft':
      return t({ id: 'plan.dayPlan.backDraft', message: 'Draft' });
    case 'today':
      return t({ id: 'plan.dayPlan.backToday', message: 'Today' });
    case 'screen':
      return t({ id: 'plan.dayPlan.backPlain', message: 'Back' });
    case 'tripMap':
    case 'hub':
      return t({ id: 'plan.dayPlan.back', message: 'Trip' });
  }
}
