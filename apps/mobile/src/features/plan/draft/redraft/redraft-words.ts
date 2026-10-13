import { clock, estimateMoney } from '../data/format';
import type { CardLine, ChangeCard as ChangeCardModel, MetricChip } from '../data/redraft';
import { plural, t } from '@lingui/core/macro';
import { type RedraftReasonKey } from '@cp/domain';

export const CARD_STEP_MS = 620;

function lineText(line: CardLine, locale: string, tz: string): string {
  const at = clock(locale, line.startsAt, tz);
  const name = line.name;
  return name === '' ? at : `${at} ${name}`;
}

export interface ChangeCardProps {
  readonly card: ChangeCardModel;
  readonly index: number;
  readonly kept: boolean;
  readonly locale: string;
  readonly tz: string;
  readonly onToggle: () => void;
}

/** What one change says: the old line, the new one (or how far stops shift), and why. */
export function changeCardWords(
  card: ChangeCardModel,
  locale: string,
  tz: string,
): { readonly before: string | null; readonly after: string; readonly reason: string | null } {
  const before =
    card.kind === 'change' && card.before !== null ? lineText(card.before, locale, tz) : null;
  const shifted = card.kind === 'shifts' ? card.count : 0;
  const maxMin = card.kind === 'shifts' ? card.maxMin : 0;
  const movedTo = card.kind === 'change' ? (card.movedToDay ?? 0) : 0;
  const after =
    card.kind === 'shifts'
      ? t({
          id: 'planDraft.change.shifts',
          message: plural(shifted, {
            one: `One stop moves by up to ${maxMin} min`,
            other: `# stops move by up to ${maxMin} min`,
          }),
        })
      : card.movedToDay !== null
        ? t({ id: 'planDraft.change.movedToDay', message: `Moved to day ${movedTo}` })
        : card.after !== null
          ? lineText(card.after, locale, tz)
          : t({ id: 'planDraft.change.dropped', message: 'Taken out' });
  const reason = card.kind === 'change' ? card.reason : null;
  return { before, after, reason };
}

export function metricWords(chip: MetricChip, locale: string): string {
  switch (chip.kind) {
    case 'transit': {
      const minutes = Math.abs(chip.deltaMin);
      if (chip.deltaMin < 0) {
        return t({ id: 'planDraft.metric.transitLess', message: `${minutes} min less travelling` });
      }
      if (chip.deltaMin > 0) {
        return t({ id: 'planDraft.metric.transitMore', message: `${minutes} min more travelling` });
      }
      return t({ id: 'planDraft.metric.transitSame', message: 'Same time travelling' });
    }
    case 'pace':
      return chip.pace === 'slower'
        ? t({ id: 'planDraft.metric.slower', message: 'Slower pace' })
        : chip.pace === 'faster'
          ? t({ id: 'planDraft.metric.fuller', message: 'Fuller pace' })
          : t({ id: 'planDraft.metric.samePace', message: 'Same pace' });
    case 'must_dos': {
      const kept = chip.kept;
      const total = chip.total;
      return kept === total
        ? t({
            id: 'planDraft.metric.allKept',
            message: plural(total, { one: 'Must-do kept', other: 'All # must-dos kept' }),
          })
        : t({ id: 'planDraft.metric.someKept', message: `${kept} of ${total} must-dos kept` });
    }
    case 'cost': {
      // The change is all the server sends (no before and after), so it is rounded as an estimate
      // itself rather than taken between two rounded figures.
      const amount = estimateMoney(locale, Math.abs(chip.deltaMinor), chip.currency);
      return chip.deltaMinor < 0
        ? t({ id: 'planDraft.metric.cheaper', message: `${amount} less each` })
        : t({ id: 'planDraft.metric.dearer', message: `${amount} more each` });
    }
  }
}

export function reasonLabel(reason: RedraftReasonKey): string {
  switch (reason) {
    case 'slower':
      return t({ id: 'planDraft.reason.slower', message: 'Slower' });
    case 'lighter_day':
      return t({ id: 'planDraft.reason.lighterDay', message: 'Lighter day' });
    case 'later_start':
      return t({ id: 'planDraft.reason.laterStart', message: 'Later start' });
    // `less_train` is an earlier build's chip, read the same way: less time getting around.
    case 'less_train':
    case 'less_travel':
      return t({ id: 'planDraft.reason.lessTravel', message: 'Less travel' });
    case 'cheaper':
      return t({ id: 'planDraft.reason.cheaper', message: 'Cheaper' });
    case 'more_food':
      return t({ id: 'planDraft.reason.moreFood', message: 'More food' });
    case 'swap_it_out':
      return t({ id: 'planDraft.reason.swap', message: 'Swap it out' });
    case 'surprise_me':
      return t({ id: 'planDraft.reason.surprise', message: 'Surprise me' });
  }
}

export interface ReasonChipsProps {
  readonly selected: ReadonlySet<RedraftReasonKey>;
  readonly onToggle: (reason: RedraftReasonKey) => void;
  readonly disabled?: boolean;
}
