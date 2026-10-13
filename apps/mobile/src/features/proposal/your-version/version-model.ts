import { plural, t } from '@lingui/core/macro';
import type { Hype } from '../data/proposal';
import type { Saving } from '../data/savings';
import type { Pick } from '../data/picks';
import type { ReactNode } from 'react';
import type { GuideStickerId as GuideId } from '@/ui/premium/stickers/guides';

export function reactionWords(kind: string): string {
  switch (kind) {
    case 'okay_wow':
      return t({ id: 'proposal.reaction.okayWow', message: 'OKAY WOW' });
    case 'six_am':
      return t({ id: 'proposal.reaction.sixAm', message: '6AM??' });
    case 'im_in':
      return t({ id: 'proposal.reaction.imIn', message: 'I’M IN' });
    case 'heart':
      return '♥';
    case 'fire':
      return t({ id: 'proposal.reaction.fire', message: 'On fire' });
    default:
      return t({ id: 'proposal.reaction.laugh', message: 'Ha!' });
  }
}

export interface HypeBarProps {
  readonly hype: Hype | null;
  readonly latest: { readonly name: string; readonly kind: string } | null;
  /** The organiser's first name: she is in from the moment she sends the plan. */
  readonly organiser?: string;
}

/** Who is in, counting the organiser, in words that stay true for a crew of two. */
export function crewInLine(boarded: number, recipients: number, organiser: string): string {
  if (boarded === 0) {
    return organiser === ''
      ? t({ id: 'proposal.hype.nobodyYet', message: 'Nobody has answered yet.' })
      : t({ id: 'proposal.hype.onlyOrganiser', message: `Only ${organiser} is in so far.` });
  }
  const going = boarded + 1;
  const crew = recipients + 1;
  return t({
    id: 'proposal.hype.crewIn',
    message: plural(crew, { other: `${going} of # in the crew are in.` }),
  });
}

/** The share of the crew who are in, the organiser counted; 0 while there is nobody to count. */
export function crewInPct(hype: Hype | null): number {
  if (hype === null || hype.recipients <= 0) return 0;
  const boarded = Math.min(hype.boarded, hype.recipients);
  return Math.round(((boarded + 1) / (hype.recipients + 1)) * 100);
}

export interface ShareCardProps {
  readonly locale: string;
  readonly baseMinor: number;
  readonly currency: string;
  readonly savings: readonly Saving[];
  readonly chosen: readonly string[];
  readonly onToggle: (optionId: string, on: boolean) => void;
}

/** The share with the chosen savings taken. */
export function shareWith(
  baseMinor: number,
  savings: readonly Saving[],
  chosen: readonly string[],
): number {
  return savings.reduce((sum, s) => (chosen.includes(s.id) ? sum + s.deltaMinor : sum), baseMinor);
}

export interface WhySheetProps {
  readonly pick: Pick;
  /** "Day 1 · 14:00". */
  readonly when: string;
  readonly reason: string;
  /** Opens the place's page; absent for a stop with no place on file. */
  readonly onPlace?: (() => void) | undefined;
  /** Opens the stop's day in the plan, where it can be asked about. */
  readonly onDay?: (() => void) | undefined;
  readonly onDismiss: () => void;
}

export interface PicksListProps {
  readonly picks: readonly Pick[];
  /** "Day 1 · 17:00" for a pick. */
  readonly when: (pick: Pick) => string;
  /** The card's tag, as this reader may truthfully read it. */
  readonly tag: (pick: Pick) => string;
  readonly onOpen: (pick: Pick) => void;
}

export interface YourVersionViewProps {
  readonly name: string;
  /** The crew's shared version: the plan's own highlights, with no claim about the reader. */
  readonly group: boolean;
  /** The reader has wishes on record (a must-do, taste answers): the plan may say it used them. */
  readonly personalised: boolean;
  /** The organiser's first name, for a reader the plan was not personalised for. */
  readonly organiser: string;
  /** "Lisbon · Nov 5–11". */
  readonly tripLine: string;
  /** Opens the whole plan, read-only for a member; absent until the plan area offers it. */
  readonly onPlan: (() => void) | undefined;
  /** The organiser reading someone else's version. */
  readonly preview: boolean;
  readonly guide: GuideId;
  readonly chip: string | null;
  readonly pending: boolean;
  readonly fallbackNote: string | null;
  readonly picks: readonly Pick[];
  readonly when: (pick: Pick) => string;
  readonly tag: (pick: Pick) => string;
  readonly share: ReactNode;
  readonly hype: ReactNode;
  /** The reader's standing answer; null while they have not answered. */
  readonly answer: 'in' | 'maybe' | 'out' | 'waitlisted' | null;
  readonly onBack: () => void;
  readonly onPick: (pick: Pick) => void;
  readonly onIn: () => void;
  readonly onMaybe: () => void;
  /** "I can't make it": asks first, since it frees the seat. */
  readonly onOut: () => void;
  readonly onAsk: () => void;
}
