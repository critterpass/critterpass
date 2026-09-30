/**
 * The plan editor as the day screens use it: change reasons in the member's words, and the
 * conflict and locked-item toasts ("Maya moved this too").
 */
import { useLingui } from '@lingui/react/macro';

import { impact } from '@/motion/feedback';
import { toast } from '@/motion/island-toast';

import { usePlanEditor } from './use-plan-editor';
import type { TripPlan } from './use-trip-plan';

export function useDayEditing(plan: TripPlan) {
  const { t } = useLingui();
  return usePlanEditor(
    plan,
    {
      moved: t({ id: 'plan.day.reason.moved', message: 'New time' }),
      added: t({ id: 'plan.day.reason.added', message: 'Added to the day' }),
      removed: t({ id: 'plan.day.reason.removed', message: 'Taken off the day' }),
    },
    {
      onConflict: (ids, by) => {
        impact('warning');
        toast.show({
          id: 'plan-conflict',
          title:
            by === null
              ? t({ id: 'plan.day.conflictSomeone', message: 'Someone moved this too' })
              : t({ id: 'plan.day.conflict', message: `${by} moved this too` }),
          subtitle: t({
            id: 'plan.day.conflictLine',
            message: 'Their change stays. Try yours again.',
          }),
        });
      },
      onLocked: () => {
        impact('error');
        toast.show({
          id: 'plan-locked',
          title: t({ id: 'plan.day.lockedToast', message: 'That one is booked' }),
          subtitle: t({
            id: 'plan.day.lockedLine',
            message: 'Open it to change it anyway.',
          }),
        });
      },
    },
  );
}
