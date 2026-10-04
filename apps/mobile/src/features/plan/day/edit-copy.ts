/**
 * The day screens' words for how an edit went (a member's goes to the crew) and for a fit warning
 * on a stop (what it overlaps, how short the time to get there is).
 */
import { t } from '@lingui/core/macro';

import type { DayItem } from '@/data/plan/plan-model';
import type { EditOutcome } from '@/data/plan/use-plan-editor';
import { impact } from '@/motion/feedback';
import { toast } from '@/motion/island-toast';

import type { FitWarning } from './fit-check';

/** Says how an edit went: a member's is sent to the crew, an organiser's lands with a tap. */
export function announceEdit(outcome: EditOutcome): void {
  if (outcome.kind === 'proposed') {
    impact('success');
    toast.show({
      id: 'plan-proposed',
      title: t({ id: 'plan.day.proposedToast', message: 'Sent to the crew' }),
      subtitle: t({ id: 'plan.day.proposedLine', message: 'It changes once they say yes.' }),
    });
  } else if (outcome.kind === 'applied') {
    impact('success');
  }
}

/** A fit warning in words: what a stop overlaps, or how short the time to get there is. */
export function fitWarningText(warning: FitWarning, all: readonly DayItem[]): string {
  const titleOf = (id: string | undefined, items: readonly DayItem[]) =>
    items.find((item) => item.stableId === id)?.title ?? '';
  // The placeholders stay positional ({0}, {1}) as the catalogs translate them.
  return warning.code === 'OVERLAP'
    ? t({ id: 'plan.day.fit.overlap', message: `Overlaps ${titleOf(warning.relatedId, all)}` })
    : t({
        id: 'plan.day.fit.travel',
        message: `${warning.minutes ?? 0} min short to get here from ${titleOf(warning.relatedId, all)}`,
      });
}
