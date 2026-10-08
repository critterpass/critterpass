/**
 * The day screens' words for how an edit went: one toast for every change, saying what changed
 * ("Tanah Lot · Added to Thu, Oct 22 · 16:30") with UNDO for an organiser's applied edit, or that a
 * member's went to the crew with a way to see it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- toast ids, never copy (every line is worded through `t`). */
import type { PlanOp, PlanState } from '@cp/domain';
import { plural, t } from '@lingui/core/macro';

import { minutesOnDay } from '@/data/plan/plan-model';
import type { EditOutcome, UndoOutcome } from '@/data/plan/use-plan-editor';
import { impact } from '@/motion/feedback';
import { toast } from '@/motion/island-toast';

import { clock, clockRange } from './format';

export interface EditContext {
  /** The plan as it was when the edit was made. */
  readonly state: PlanState;
  readonly titleOf: (stableId: string) => string | null;
  /** "Thu, Oct 22" for a day number. */
  readonly dayName: (dayNo: number) => string;
  readonly tz: string;
  readonly locale: string;
  /** What an add adds, when the caller knows its name. */
  readonly label?: string | undefined;
}

export interface EditWords {
  readonly title: string;
  readonly subtitle?: string;
}

type ItemOp = Exclude<PlanOp, { op: 'reorder_days' }>;
type ChangeOp = Extract<PlanOp, { op: 'move' | 'resize' }>;

/** What a set of plan ops changed, in a toast's two lines. */
export function describeEdit(ops: readonly PlanOp[], ctx: EditContext): EditWords {
  const items = new Map(ctx.state.items.map((item) => [item.stable_id, item]));
  const itemOps = ops.filter((op): op is ItemOp => op.op !== 'reorder_days');
  if (itemOps.length === 0) {
    return { title: t({ id: 'plan.edit.daysReordered', message: 'Days reordered' }) };
  }
  const dateOf = (dayNo: number) =>
    ctx.state.days.find((day) => day.day_no === dayNo)?.date ?? null;
  const minutes = (dayNo: number, iso: string | undefined, tz: string) => {
    const date = dateOf(dayNo);
    return iso === undefined || date === null ? null : minutesOnDay(iso, tz, date);
  };
  const where = (dayNo: number, startMin: number | null) =>
    startMin === null
      ? ctx.dayName(dayNo)
      : `${ctx.dayName(dayNo)} · ${clock(ctx.locale, startMin)}`;
  const nameOf = (stableId: string) =>
    ctx.titleOf(stableId) ?? t({ id: 'plan.edit.aStop', message: 'A stop' });

  /** " · 2 other stops moved" for the stops an edit moved along with its own. */
  const alsoMoved = (others: number) =>
    others <= 0
      ? ''
      : t({
          id: 'plan.edit.othersMoved',
          message: plural(others, {
            one: ' · # other stop moved',
            other: ' · # other stops moved',
          }),
        });
  const adds = itemOps.filter((op) => op.op === 'add');
  const first = adds[0];
  if (first !== undefined) {
    const place = where(
      first.new.day_no,
      minutes(first.new.day_no, first.new.starts_at, first.new.tz ?? ctx.tz),
    );
    const count = adds.length;
    return {
      title:
        count > 1
          ? t({
              id: 'plan.edit.addedMany',
              message: plural(count, { one: '# place added', other: '# places added' }),
            })
          : (ctx.label ??
            first.new.custom_place?.name ??
            t({ id: 'plan.edit.addedOne', message: 'Added to the plan' })),
      subtitle: t({ id: 'plan.edit.addedTo', message: `Added to ${place}` }),
    };
  }

  const removes = itemOps.filter((op) => op.op === 'remove');
  const gone = removes[0];
  if (gone !== undefined) {
    const count = removes.length;
    const day = items.get(gone.item)?.day_no;
    const from = day === undefined ? '' : ctx.dayName(day);
    return count > 1
      ? {
          title: t({
            id: 'plan.edit.removedMany',
            message: plural(count, { one: '# stop removed', other: '# stops removed' }),
          }),
        }
      : {
          title: nameOf(gone.item),
          subtitle: `${
            from === ''
              ? t({ id: 'plan.edit.removed', message: 'Removed from the plan' })
              : t({ id: 'plan.edit.removedFrom', message: `Removed from ${from}` })
          }${alsoMoved(itemOps.length - count)}`,
        };
  }

  const changes = itemOps.filter((op): op is ChangeOp => op.op === 'move' || op.op === 'resize');
  const dayOf = (op: ChangeOp) => (op.op === 'move' ? op.new.day_no : undefined);
  const crossing = changes.find((op) => {
    const to = dayOf(op);
    return to !== undefined && to !== items.get(op.item)?.day_no;
  });
  const more = alsoMoved(changes.length - 1);
  if (crossing !== undefined) {
    const to = dayOf(crossing) ?? 1;
    const tz = items.get(crossing.item)?.tz ?? ctx.tz;
    const place = where(to, minutes(to, crossing.new.starts_at, tz));
    return {
      title: nameOf(crossing.item),
      subtitle: `${t({ id: 'plan.edit.movedTo', message: `Moved to ${place}` })}${more}`,
    };
  }
  const lead =
    changes.find((op) => op.op === 'resize') ?? (changes.length === 1 ? changes[0] : undefined);
  if (lead !== undefined) {
    const item = items.get(lead.item);
    const day = item?.day_no ?? 1;
    const tz = item?.tz ?? ctx.tz;
    const start = minutes(day, lead.new.starts_at ?? item?.starts_at, tz);
    const end = minutes(day, lead.new.ends_at ?? item?.ends_at, tz);
    const range = start === null || end === null ? '' : clockRange(ctx.locale, start, end);
    return {
      title: nameOf(lead.item),
      subtitle: `${t({ id: 'plan.edit.nowAt', message: `Now ${range}` })}${more}`,
    };
  }
  const count = changes.length;
  const day = items.get(changes[0]?.item ?? '')?.day_no;
  return {
    title:
      day === undefined
        ? t({ id: 'plan.edit.reordered', message: 'New order' })
        : t({ id: 'plan.edit.reorderedDay', message: `New order for ${ctx.dayName(day)}` }),
    subtitle: t({
      id: 'plan.edit.retimed',
      message: plural(count, { one: '# stop has a new time', other: '# stops have new times' }),
    }),
  };
}

export interface EditFollowUps {
  /** Takes the applied edit back. */
  readonly undo: (opId: string) => Promise<UndoOutcome>;
  /** Opens the change a member sent to the crew. */
  readonly see: (changesetId: string) => void;
}

/** Says how an undo went: the plan is back, or why it isn't. */
export function announceUndo(result: UndoOutcome): void {
  if (result === 'undone') {
    impact('success');
    toast.show({
      id: 'plan-edit-undone',
      title: t({ id: 'plan.edit.undone', message: 'Undone' }),
      subtitle: t({ id: 'plan.edit.undoneLine', message: 'The plan is back as it was.' }),
    });
    return;
  }
  impact('warning');
  toast.show(
    result === 'moved_on'
      ? {
          id: 'plan-edit-undo-late',
          title: t({ id: 'plan.edit.undoLate', message: 'Can’t undo that now' }),
          subtitle: t({ id: 'plan.edit.undoLateLine', message: 'The plan has changed since.' }),
        }
      : {
          id: 'plan-edit-undo-offline',
          title: t({ id: 'plan.edit.undoOffline', message: 'Undo needs signal' }),
          subtitle: t({
            id: 'plan.edit.undoOfflineLine',
            message: 'Try again once you’re back online.',
          }),
        },
  );
}

/**
 * Says how an edit went, replacing whatever toast is up: an organiser's with what changed and
 * UNDO, a member's as sent to the crew with SEE.
 */
export function announceChange(
  outcome: EditOutcome,
  words: EditWords,
  followUps: EditFollowUps,
): void {
  if (outcome.kind === 'unavailable') return;
  impact('success');
  toast.dismiss();
  if (outcome.kind === 'proposed') {
    const { changesetId } = outcome;
    toast.show({
      id: `plan-proposed-${changesetId}`,
      title: t({ id: 'plan.day.proposedToast', message: 'Sent to the crew' }),
      subtitle: t({ id: 'plan.day.proposedLine', message: 'It changes once they say yes.' }),
      action: {
        label: t({ id: 'plan.edit.see', message: 'SEE' }),
        onPress: () => followUps.see(changesetId),
      },
    });
    return;
  }
  const { opId } = outcome;
  toast.show({
    id: `plan-edit-${opId}`,
    ...words,
    action: {
      label: t({ id: 'plan.edit.undo', message: 'UNDO' }),
      onPress: () => {
        toast.dismiss();
        void followUps.undo(opId).then(announceUndo);
      },
    },
  });
}
