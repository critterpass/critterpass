/** The components that draw the story's cards, and what each card is given. */
import type { ComponentType } from 'react';

import type { PostcardCardProps } from '@/features/album';
import type { ReceiptLine } from '../cards/receipt-line';
import type { GuideId } from '@/lib/navigation/active-guide';
import type { FormRow } from '../data/recap-rows';
import { type StrokeFetch } from '../signature/stroke-store';

/** A stop on the recap's route ("Days 2–4", "Day 4 · 02:51"). */
export interface RouteStop {
  readonly id: string;
  readonly name: string;
  readonly dayLabel: string;
  /** Glows (the 02:51 start). */
  readonly highlight?: boolean;
}

export interface StoryCardViews {
  readonly Cover: ComponentType<CoverCardProps>;
  readonly Critters: ComponentType<CrittersCardProps>;
  readonly Route: ComponentType<RouteCardProps>;
  readonly Awards: ComponentType<AwardsCardProps>;
  readonly Receipt: ComponentType<ReceiptCardProps>;
  readonly GotAway: ComponentType<GotAwayCardProps>;
  readonly Stamp: ComponentType<StampCardProps>;
  readonly Postcard: ComponentType<PostcardCardProps>;
}

export interface AwardCardData {
  readonly id: string;
  readonly userId: string;
  readonly initial: string;
  readonly title: string;
  readonly line: string;
  readonly mvp: boolean;
  readonly mine: boolean;
}

/** A resting angle of 1–3° either way, from the traveller's id: the same on every phone. */
export function restingAngle(userId: string): number {
  let hash = 0;
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const size = 1 + (hash % 3);
  return hash % 2 === 0 ? size : -size;
}

export interface AwardsCardProps {
  readonly eyebrow: string;
  readonly headline: string;
  readonly awards: readonly AwardCardData[];
}

export interface ReceiptCardProps {
  readonly guide: GuideId;
  readonly eyebrow: string;
  readonly headline: string;
  readonly title: string;
  readonly subtitle: string;
  readonly sections: readonly (readonly ReceiptLine[])[];
  readonly note: string;
  readonly footer: string;
  readonly paidLabel: {
    readonly top: string;
    readonly title: string;
    readonly bottom: string;
  } | null;
  readonly share: string | null;
}

export interface CrittersCardProps {
  readonly eyebrow: string;
  readonly headline: string;
  readonly line: string;
  readonly forms: readonly FormRow[];
}

const FIRST_STOP_MS = 900;

const LAST_STOP_MS = 7200;

/** When each of `count` stops pops, spread over the card. */
export function stopTimes(count: number): number[] {
  if (count <= 1) return count === 1 ? [FIRST_STOP_MS] : [];
  const gap = (LAST_STOP_MS - FIRST_STOP_MS) / (count - 1);
  return Array.from({ length: count }, (_, index) => Math.round(FIRST_STOP_MS + index * gap));
}

export interface RouteCardProps {
  readonly guide: GuideId;
  readonly eyebrow: string;
  readonly km: number;
  readonly formatKm: (value: number) => string;
  readonly line: string;
  readonly stops: readonly RouteStop[];
  readonly longestLeg: string | null;
}

export interface CoverCardProps {
  readonly guide: GuideId;
  readonly ground: string;
  readonly eyebrow: string;
  readonly place: string;
  readonly chips: readonly string[];
  readonly forms: readonly FormRow[];
}

export interface GotAwayFormChip {
  readonly row: FormRow;
  readonly found: boolean;
  readonly gotAway: boolean;
}

export interface GotAwayCardProps {
  readonly kind: string;
  readonly city: string;
  readonly eyebrow: string;
  readonly name: string;
  readonly story: string;
  readonly forms: readonly GotAwayFormChip[];
  readonly formsLabel: string;
}

export interface StampSigner {
  readonly userId: string;
  readonly name: string;
  readonly color: string;
  readonly strokeKey: string | null;
}

export interface StampCardProps {
  readonly chrome: string;
  readonly page: string | null;
  readonly place: string;
  readonly top: string;
  readonly bottom: string;
  readonly ink: string;
  /** The stamp's small lines, where the ink needs darkening at their size. */
  readonly lineInk?: string;
  readonly guideKind: string;
  readonly older: readonly { readonly id: string; readonly title: string; readonly ink: string }[];
  readonly signers: readonly StampSigner[];
  readonly caption: string;
  readonly detail: string;
  /** SIGN IT sits under the page: the page keeps room for it. */
  readonly signable?: boolean;
  readonly loadStroke?: StrokeFetch;
}

/** The story token for this card: it is the long one. */
export const ROUTE_CARD_MS = 9000;
