/**
 * The widget gallery's rows (5c-5): the seven home-screen widgets in the design's order, each with
 * the tier it belongs to and whether one is already on this phone. A Boost or Pass+ widget can
 * always be added: the widget itself shows its locked state and opens the right offer.
 */
/* eslint-disable lingui/no-unlocalized-strings -- widget kinds and tiers, never copy. */
import type { WidgetKind } from '@cp/domain';

export type GalleryTier = 'free' | 'boost' | 'pass_plus';

export type GalleryKind = Extract<
  WidgetKind,
  'countdown' | 'vote' | 'today' | 'balances' | 'crew' | 'next_flight' | 'critterdex'
>;

export interface GalleryRow {
  readonly kind: GalleryKind;
  readonly tier: GalleryTier;
  readonly added: boolean;
}

export const GALLERY_WIDGETS: readonly Omit<GalleryRow, 'added'>[] = [
  { kind: 'countdown', tier: 'free' },
  { kind: 'vote', tier: 'free' },
  { kind: 'today', tier: 'free' },
  { kind: 'balances', tier: 'free' },
  { kind: 'crew', tier: 'boost' },
  { kind: 'next_flight', tier: 'pass_plus' },
  { kind: 'critterdex', tier: 'free' },
];

export function galleryRows(installedKinds: readonly string[]): GalleryRow[] {
  return GALLERY_WIDGETS.map((widget) => ({
    ...widget,
    added: installedKinds.includes(widget.kind),
  }));
}

/**
 * What tapping "+" did: the launcher was asked to pin the widget (Android, where it can), or the
 * person is shown how to add it by hand (iOS has no way to add one from an app; so do launchers
 * that refuse the request).
 */
export type AddOutcome = 'asked' | 'how_to';

export function addWidget(kind: GalleryKind, pin: ((kind: string) => boolean) | null): AddOutcome {
  if (pin === null) return 'how_to';
  try {
    return pin(kind) ? 'asked' : 'how_to';
  } catch {
    return 'how_to';
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whole days until the countdown widget's target, counted as the widget counts them; null when
 * there is no trip to count down to (or the snapshot cannot be read).
 */
export function countdownDays(snapshot: unknown, now: number): number | null {
  const countdown = (snapshot as { countdown?: { target_at?: unknown } | null } | null)?.countdown;
  const target = typeof countdown?.target_at === 'string' ? Date.parse(countdown.target_at) : NaN;
  if (Number.isNaN(target)) return null;
  const left = target - now;
  return left <= 0 ? 0 : Math.floor(left / DAY_MS);
}
