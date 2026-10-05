/**
 * The plan editor as the day screens use it: change reasons in the member's words, the conflict
 * and locked-item toasts ("Maya moved this too"), and one toast for every edit that went through,
 * saying what changed with UNDO (an organiser's) or that it went to the crew (a member's).
 */
/* eslint-disable lingui/no-unlocalized-strings -- lock kinds and toast ids, never copy (every line is worded through `t`). */
import type { PlanOp, PlanPush } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useCallback, useLayoutEffect, useRef } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';
import { impact } from '@/motion/feedback';
import { toast } from '@/motion/island-toast';
import { usePlanEditor, type EditOutcome } from '@/data/plan/use-plan-editor';
import { type TripPlan } from '@/data/plan/use-trip-plan';

import { announceChange, describeEdit } from './edit-copy';
import { dayName } from './format';
import { reviewRoute } from './routes';

export interface SubmitOptions {
  readonly confirmLocked?: boolean;
  /** The later stops these ops push for one stop (kept on the version so they can go back). */
  readonly pushed?: PlanPush;
  /** What an add adds, for the toast ("Tanah Lot"). */
  readonly label?: string;
}

/** The lock that stopped an edit: the strongest one among the stops it touched. */
function lockAmong(plan: TripPlan, ids: readonly string[]): 'booking' | 'must_do' | 'user' | null {
  const locks = plan.state.items
    .filter((item) => ids.includes(item.stable_id))
    .map((item) => (item.booking_id != null ? 'booking' : (item.locked_reason ?? null)));
  if (locks.includes('booking')) return 'booking';
  if (locks.includes('must_do')) return 'must_do';
  return locks.includes('user') ? 'user' : null;
}

export function useDayEditing(plan: TripPlan) {
  const { t } = useLingui();
  const locale = useLocale();
  const latest = useRef({ plan, locale });
  useLayoutEffect(() => {
    latest.current = { plan, locale };
  });
  const editor = usePlanEditor(
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
      onLocked: (ids) => {
        impact('error');
        const lock = lockAmong(latest.current.plan, ids);
        toast.dismiss();
        toast.show({
          id: 'plan-locked',
          title:
            lock === 'booking'
              ? t({ id: 'plan.day.lockedToast', message: 'That one is booked' })
              : lock === 'user'
                ? t({ id: 'plan.day.pinnedToast', message: 'That one is pinned to its time' })
                : t({ id: 'plan.day.mustDoToast', message: 'That’s a must-do' }),
          subtitle:
            lock === 'booking'
              ? t({ id: 'plan.day.lockedLine', message: 'Open it to change it anyway.' })
              : t({ id: 'plan.day.mustDoLine', message: 'Open it to move it anyway.' }),
        });
      },
    },
  );
  const { submit: send, undo } = editor;

  const submit = useCallback(
    async (ops: readonly PlanOp[], options: SubmitOptions = {}): Promise<EditOutcome> => {
      const { plan: before, locale: lang } = latest.current;
      const outcome = await send(ops, {
        ...(options.confirmLocked === undefined ? {} : { confirmLocked: options.confirmLocked }),
        ...(options.pushed === undefined ? {} : { pushed: options.pushed }),
      });
      if (outcome.kind === 'unavailable' || ops.length === 0) return outcome;
      const tripId = before.trip?.id ?? '';
      const words = describeEdit(ops, {
        state: before.state,
        titleOf: (stableId) => before.display.get(stableId)?.title ?? null,
        dayName: (dayNo) => {
          const date = before.state.days.find((day) => day.day_no === dayNo)?.date ?? null;
          return date === null
            ? t({ id: 'plan.day.item.dayChip', message: `Day ${dayNo}` })
            : dayName(lang, date);
        },
        tz: before.trip?.tz ?? 'UTC',
        locale: lang,
        label: options.label,
      });
      // After the caller's own follow-up has run, so this is the one toast left showing.
      setTimeout(
        () =>
          announceChange(outcome, words, {
            undo,
            see: (changesetId) => router.push(reviewRoute(tripId, changesetId)),
          }),
        0,
      );
      return outcome;
    },
    [send, undo, t],
  );

  return { ...editor, submit };
}

export { announceEdit } from './edit-copy';
