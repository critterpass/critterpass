/**
 * Why a pick is on someone's version, in words that are true for them: the card's tag and the
 * sentence on the why sheet. What is known comes first (the stop is the reader's own must-do, or a
 * named crewmate's); the guide's own tag is kept only for a reader who has told us what they want,
 * so someone who joined with a code and was never asked is not told the plan was built around
 * their picks.
 */
/* eslint-disable lingui/no-unlocalized-strings -- reason tags are wire values, never copy. */
import { isProposalReasonTag, type ProposalReasonTag } from '@cp/domain';
import { t } from '@lingui/core/macro';

/** Tags a group version may carry: what the stop is, never a claim about the reader. */
export const GROUP_TAG_MUST_DO = 'group_must_do';
export const GROUP_TAG_DAY = 'group_day';

/** The card's tag for each reason the guide may give (one per tag in the shared list). */
const REASON_LABELS: Readonly<Record<ProposalReasonTag, () => string>> = {
  your_must_do: () => t({ id: 'proposal.reason.mustDo', message: 'Your must-do' }),
  matches_taste: () => t({ id: 'proposal.reason.taste', message: 'You’ll love this' }),
  crew_favourite: () => t({ id: 'proposal.reason.crew', message: 'Crew favourite' }),
  good_value: () => t({ id: 'proposal.reason.value', message: 'Good value' }),
  only_here: () => t({ id: 'proposal.reason.onlyHere', message: 'Only here' }),
};

/** Longest guide-written tag the card shows; a longer one falls back to the reason tag's label. */
const CARD_LABEL_MAX = 24;

export function cardLabel(label: string | undefined): string | null {
  const line = label?.trim() ?? '';
  return line === '' || line.length > CARD_LABEL_MAX ? null : line;
}

export function reasonLabel(tag: string, dayNo: number | null = null): string {
  if (tag === GROUP_TAG_MUST_DO)
    return t({ id: 'proposal.reason.groupMustDo', message: 'Must-do' });
  if (tag === GROUP_TAG_DAY) {
    return dayNo === null
      ? t({ id: 'proposal.reason.onThePlan', message: 'On the plan' })
      : t({ id: 'proposal.reason.day', message: `Day ${dayNo}` });
  }
  // A tag this app does not know yet reads as the place-only reason.
  return (isProposalReasonTag(tag) ? REASON_LABELS[tag] : REASON_LABELS.only_here)();
}

export interface PickReason {
  readonly reasonTag: string;
  readonly reasonLabel: string | null;
  readonly dayNo: number | null;
  readonly mustDoOwnerId?: string | null;
  readonly mustDoOwnerName?: string | null;
}

export interface ReasonReader {
  readonly uid: string | null;
  /** The reader has a must-do on the trip or taste answers on file. */
  readonly hasWishes: boolean;
  readonly guideName: string;
}

const CLAIMS_ABOUT_READER: readonly string[] = ['your_must_do', 'matches_taste'];

/** The card's tag for a pick, as this reader may truthfully read it. */
export function pickTag(pick: PickReason, reader: ReasonReader): string {
  const owner = pick.mustDoOwnerId ?? null;
  if (owner !== null) {
    return owner === reader.uid
      ? reasonLabel('your_must_do')
      : reasonLabel(GROUP_TAG_MUST_DO, pick.dayNo);
  }
  // A claim about the reader needs something the reader said; without it the tag is the day.
  if (!reader.hasWishes || pick.reasonTag === 'your_must_do') {
    return CLAIMS_ABOUT_READER.includes(pick.reasonTag) || pick.reasonLabel !== null
      ? reasonLabel(GROUP_TAG_DAY, pick.dayNo)
      : reasonLabel(pick.reasonTag, pick.dayNo);
  }
  return pick.reasonLabel ?? reasonLabel(pick.reasonTag, pick.dayNo);
}

/** Why the stop is there, in a sentence for the why sheet. */
export function reasonWhy(pick: PickReason, reader: ReasonReader): string {
  const { guideName } = reader;
  const owner = pick.mustDoOwnerId ?? null;
  if (owner !== null && owner === reader.uid) {
    return t({ id: 'proposal.why.mustDo', message: 'You added it as a must-do in setup.' });
  }
  const name = pick.mustDoOwnerName ?? '';
  if (owner !== null) {
    return name === ''
      ? t({ id: 'proposal.why.crewMustDo', message: 'It is one of the crew’s must-dos.' })
      : t({ id: 'proposal.why.theirMustDo', message: `It is ${name}’s must-do for this trip.` });
  }
  const plain = t({
    id: 'proposal.why.plain',
    message: `${guideName} put it on the plan for the whole crew.`,
  });
  switch (pick.reasonTag) {
    case 'matches_taste':
      return reader.hasWishes
        ? t({
            id: 'proposal.why.taste',
            message: `It matches what you picked in your this-or-thats, so ${guideName} put it in.`,
          })
        : plain;
    case 'good_value':
      return t({ id: 'proposal.why.value', message: 'It gives a lot for what it costs.' });
    case 'only_here':
      return t({ id: 'proposal.why.onlyHere', message: 'You can only do this here.' });
    default:
      // "Crew favourite" is the guide's guess, not a count of who wanted it.
      return plain;
  }
}
