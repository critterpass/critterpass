/**
 * What a FIX on the plan check does, in words: the line under a card ("→ …", never with a blank
 * time), the button's label, which names the kind of fix instead of one word for every problem,
 * and the reason a fixer gives for each change in a review ("so the drive fits") in place of the
 * reason code the server sends.
 */
/* eslint-disable lingui/no-unlocalized-strings -- reason codes, never copy. */
import type { PlanCheckIssue } from '@cp/domain';
import { t } from '@lingui/core/macro';

import { driveLine } from './format';
import type { FixPreview, IssueContext } from './issue-copy';

/** The "→ …" line: what FIX does. Null when there is nothing to do. */
export function fixSummary(
  issue: PlanCheckIssue,
  ctx: IssueContext,
  preview: FixPreview,
): string | null {
  const fix = issue.fix;
  if (fix === null || fix.kind === 'none') return null;
  if (fix.kind === 'apply') {
    const op = fix.ops[0];
    const at = op?.after?.starts_at;
    if (op === undefined || typeof at !== 'string') {
      return t({ id: 'plan.check.fix.generic', message: 'Move it to a time that works' });
    }
    const place = ctx.name(op.target);
    const time = ctx.clock(at, issue.day_id);
    if (time === '') {
      return t({ id: 'plan.check.fix.generic', message: 'Move it to a time that works' });
    }
    const before = op.before?.starts_at;
    const was = typeof before === 'string' ? ctx.clock(before, issue.day_id) : '';
    return was === '' || was === time
      ? t({ id: 'plan.check.fix.moveTo', message: `${place} at ${time}` })
      : t({ id: 'plan.check.fix.moveToWas', message: `${place} at ${time} (was ${was})` });
  }
  switch (fix.screen) {
    case 'less_driving': {
      const saved = preview.savedMin ?? null;
      const moved = preview.movedTo ?? null;
      if (saved !== null && preview.estimated === true) {
        const less = driveLine(saved);
        return t({
          id: 'plan.check.fix.reorderAbout',
          message: `Same day, about ${less} less driving`,
        });
      }
      if (moved !== null && moved.time !== '' && saved !== null) {
        const place = ctx.name(moved.stableId);
        const time = moved.time;
        const less = driveLine(saved);
        return t({
          id: 'plan.check.fix.reorderMove',
          message: `${place} at ${time}, and ${less} less driving`,
        });
      }
      if (saved !== null) {
        const less = driveLine(saved);
        return t({ id: 'plan.check.fix.reorder', message: `Same day, ${less} less driving` });
      }
      return t({ id: 'plan.check.fix.reorderPlain', message: 'Same day, less driving' });
    }
    case 'rain_crowds': {
      const swap = preview.swap ?? null;
      if (swap?.withName != null) {
        const other = swap.withName;
        return t({ id: 'plan.check.fix.swapWith', message: `Swap it with ${other}` });
      }
      if (swap !== null) {
        const to = swap.to;
        return issue.kind === 'crowds'
          ? t({ id: 'plan.check.fix.goAt', message: `Go at ${to}, before it fills up` })
          : t({ id: 'plan.check.fix.dryAt', message: `Move it to ${to}, when it’s dry` });
      }
      return t({ id: 'plan.check.fix.swapPlain', message: 'Move it to a better time' });
    }
    case 'too_far': {
      const nearer = preview.nearer ?? null;
      return nearer === null
        ? t({ id: 'plan.check.fix.nearerPlain', message: 'Something nearer instead' })
        : t({ id: 'plan.check.fix.nearer', message: `${nearer} instead, on the way back` });
    }
    case 'fill_gap':
      return t({ id: 'plan.check.fix.fillGap', message: 'Fill the free time' });
  }
}

/** The card's button: what kind of fix it is. A member suggests, whatever the fix. */
export function fixKindLabel(issue: Pick<PlanCheckIssue, 'fix'>, organiser: boolean): string {
  if (!organiser) return t({ id: 'plan.check.suggest', message: 'Suggest' });
  const fix = issue.fix;
  if (fix?.kind === 'apply') return t({ id: 'plan.check.fixLabel.move', message: 'Move it' });
  if (fix?.kind === 'screen') {
    switch (fix.screen) {
      case 'less_driving':
        return t({ id: 'plan.check.fixLabel.reorder', message: 'Reorder' });
      case 'rain_crowds':
        return t({ id: 'plan.check.fixLabel.swap', message: 'Swap' });
      case 'too_far':
        return t({ id: 'plan.check.fixLabel.nearer', message: 'Nearer' });
      case 'fill_gap':
        return t({ id: 'plan.check.fixLabel.fill', message: 'Fill' });
    }
  }
  return t({ id: 'plan.check.fix', message: 'Fix' });
}

/**
 * A fixer's reason for one change, in words; null for a reason that is not a fixer's (the caller
 * shows it as it does today).
 */
export function fixReasonWords(reason: string): string | null {
  switch (reason) {
    case 'check_fix_clash':
      return t({ id: 'plan.check.reason.clash', message: 'so the drive fits' });
    case 'check_fix_reorder':
      return t({ id: 'plan.check.reason.reorder', message: 'new order, less driving' });
    case 'check_fix_closed':
      return t({ id: 'plan.check.reason.closed', message: 'when it’s open' });
    case 'check_fix_too_far':
      return t({ id: 'plan.check.reason.tooFar', message: 'a nearer place' });
    case 'check_fix_dry_after':
    case 'check_fix_dry_before':
      return t({ id: 'plan.check.reason.dry', message: 'when it’s dry' });
    case 'check_fix_quiet_before':
    case 'check_fix_quiet_after':
      return t({ id: 'plan.check.reason.quiet', message: 'when it’s quiet' });
    case 'check_fix_indoors_in_rain':
      return t({ id: 'plan.check.reason.indoors', message: 'indoors while it rains' });
    case 'check_fix_trades_places':
      return t({ id: 'plan.check.reason.trades', message: 'trades places with another stop' });
    default:
      return reason.startsWith('check_fix_')
        ? t({ id: 'plan.check.reason.other', message: 'a time that works' })
        : null;
  }
}

/** On her own draft a card opens the stop (or the day) for her to change it herself. */
export function openByHandLabel(hasStop: boolean): string {
  return hasStop
    ? t({ id: 'plan.check.fixLabel.openStop', message: 'Open the stop' })
    : t({ id: 'plan.check.fixLabel.openDay', message: 'Open the day' });
}
