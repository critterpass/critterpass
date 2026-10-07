/**
 * Perk copy. Which perks are listed is the server's call: a perk shows only while its synced
 * `perks` row is switched on, so one can be withdrawn from every paywall without a release. The
 * words for each perk live here, keyed by the row's `copy_key`; a key this app version has no
 * words for is left out rather than shown raw.
 */
import type { Perk, PerkTier } from '@cp/entitlements';
import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';

/* eslint-disable lingui/no-unlocalized-strings -- perk keys and row ids from the server's list, never copy. */
const KEY = {
  boostGuideUnlimited: 'boost_guide_unlimited',
  boostLiveMap: 'boost_live_map',
  boostNoSponsored: 'boost_no_sponsored',
  boostRedrafts: 'boost_redrafts',
  boostSeats: 'boost_seats',
  passPlusGuideUnlimited: 'pass_plus_guide_unlimited',
  passPlusIconStyles: 'pass_plus_icon_styles',
  passPlusMailboxImport: 'pass_plus_mailbox_import',
  passPlusNoSponsored: 'pass_plus_no_sponsored',
} as const;
const ROW = {
  guide: 'guide',
  redrafts: 'redrafts',
  mailbox: 'mailbox',
  seats: 'seats',
  liveMap: 'live_map',
  icons: 'icons',
  sponsored: 'sponsored',
} as const;
/* eslint-enable lingui/no-unlocalized-strings */

const PERK_COPY: Readonly<Record<string, MessageDescriptor>> = {
  'monetize.perks.pass_plus_guide_unlimited': msg({
    id: 'monetize.perks.passPlusGuideUnlimited',
    message: 'Unlimited guide chat, voice and camera',
  }),
  'monetize.perks.pass_plus_mailbox_import': msg({
    id: 'monetize.perks.passPlusMailboxImport',
    message: 'Bookings pulled from your email',
  }),
  'monetize.perks.pass_plus_icon_styles': msg({
    id: 'monetize.perks.passPlusIconStyles',
    message: 'Every icon style and avatar',
  }),
  'monetize.perks.pass_plus_no_sponsored': msg({
    id: 'monetize.perks.passPlusNoSponsored',
    message: 'No sponsored picks',
  }),
  'monetize.perks.pass_plus_next_flight': msg({
    id: 'monetize.perks.passPlusNextFlight',
    message: 'The next flight widget',
  }),
  'monetize.perks.pass_plus_read_out': msg({
    id: 'monetize.perks.passPlusReadOut',
    message: 'Pings and the evening roundup read out loud',
  }),
  'monetize.perks.pass_plus_postcard': msg({
    id: 'monetize.perks.passPlusPostcard',
    message: 'A printed postcard from each trip',
  }),
  'monetize.perks.boost_guide_unlimited': msg({
    id: 'monetize.perks.boostGuideUnlimited',
    message: 'Unlimited guide for the whole crew on this trip',
  }),
  'monetize.perks.boost_redrafts': msg({
    id: 'monetize.perks.boostRedrafts',
    message: 'Unlimited redrafts',
  }),
  'monetize.perks.boost_seats': msg({
    id: 'monetize.perks.boostSeats',
    message: 'Crews of 16',
  }),
  'monetize.perks.boost_live_map': msg({
    id: 'monetize.perks.boostLiveMap',
    message: 'The live crew map',
  }),
  'monetize.perks.boost_no_sponsored': msg({
    id: 'monetize.perks.boostNoSponsored',
    message: 'No sponsored picks on the trip',
  }),
};

export interface PerkLine {
  readonly key: string;
  readonly copy: MessageDescriptor;
}

/** The switched-on perks of a tier that have words here, in the server's order. */
export function perkLines(perks: readonly Perk[], tier: PerkTier): PerkLine[] {
  return perks
    .filter((perk) => perk.enabled && perk.tier === tier)
    .sort((a, b) => a.sort - b.sort)
    .flatMap((perk) => {
      const copy = PERK_COPY[perk.copyKey];
      return copy === undefined ? [] : [{ key: perk.key, copy }];
    });
}

export type CompareCell =
  | { readonly kind: 'text'; readonly copy: MessageDescriptor }
  | { readonly kind: 'yes' }
  | { readonly kind: 'no' };

export interface CompareRowSpec {
  readonly id: string;
  readonly label: MessageDescriptor;
  /** Free, Pass+, Boost. */
  readonly cells: readonly [CompareCell, CompareCell, CompareCell];
}

const text = (copy: MessageDescriptor): CompareCell => ({ kind: 'text', copy });
const YES: CompareCell = { kind: 'yes' };
const NO: CompareCell = { kind: 'no' };

const UNLIMITED = msg({ id: 'monetize.compare.unlimited', message: '∞' });
const NONE = msg({ id: 'monetize.compare.none', message: 'None' });

/**
 * The rows of "What's in each": one per capability, present only while a perk behind it is
 * switched on. A plan's cell shows the paid value only when that plan's own perk is on; otherwise
 * it reads as free does.
 */
export function compareRows(perks: readonly Perk[]): CompareRowSpec[] {
  const on = new Set(perks.filter((perk) => perk.enabled).map((perk) => perk.key));
  const rows: CompareRowSpec[] = [];
  const guideFree = text(msg({ id: 'monetize.compare.guide.free', message: '30 a day' }));
  if (on.has(KEY.passPlusGuideUnlimited) || on.has(KEY.boostGuideUnlimited)) {
    rows.push({
      id: ROW.guide,
      label: msg({ id: 'monetize.compare.guide', message: 'Guide chat, voice, camera' }),
      cells: [
        guideFree,
        on.has(KEY.passPlusGuideUnlimited) ? text(UNLIMITED) : guideFree,
        on.has(KEY.boostGuideUnlimited)
          ? text(msg({ id: 'monetize.compare.guide.boost', message: '∞ on trip' }))
          : guideFree,
      ],
    });
  }
  if (on.has(KEY.boostRedrafts)) {
    const three = text(msg({ id: 'monetize.compare.redrafts.free', message: '3 a trip' }));
    rows.push({
      id: ROW.redrafts,
      label: msg({ id: 'monetize.compare.redrafts', message: 'Redrafts from the guide' }),
      cells: [three, three, text(UNLIMITED)],
    });
  }
  if (on.has(KEY.passPlusMailboxImport)) {
    rows.push({
      id: ROW.mailbox,
      label: msg({ id: 'monetize.compare.mailbox', message: 'Bookings from email' }),
      cells: [NO, YES, NO],
    });
  }
  if (on.has(KEY.boostSeats)) {
    const six = text(msg({ id: 'monetize.compare.seats.free', message: '6' }));
    rows.push({
      id: ROW.seats,
      label: msg({ id: 'monetize.compare.seats', message: 'Crew size' }),
      cells: [six, six, text(msg({ id: 'monetize.compare.seats.boost', message: '16' }))],
    });
  }
  if (on.has(KEY.boostLiveMap)) {
    rows.push({
      id: ROW.liveMap,
      label: msg({ id: 'monetize.compare.liveMap', message: 'Live crew map' }),
      cells: [NO, NO, YES],
    });
  }
  if (on.has(KEY.passPlusIconStyles)) {
    rows.push({
      id: ROW.icons,
      label: msg({ id: 'monetize.compare.icons', message: 'Icon styles, avatars' }),
      cells: [
        text(msg({ id: 'monetize.compare.icons.free', message: 'A few' })),
        text(msg({ id: 'monetize.compare.icons.pass', message: 'All' })),
        NO,
      ],
    });
  }
  if (on.has(KEY.passPlusNoSponsored) || on.has(KEY.boostNoSponsored)) {
    const shown = text(msg({ id: 'monetize.compare.sponsored.free', message: 'Shown' }));
    rows.push({
      id: ROW.sponsored,
      label: msg({ id: 'monetize.compare.sponsored', message: 'Sponsored picks' }),
      cells: [
        shown,
        on.has(KEY.passPlusNoSponsored) ? text(NONE) : shown,
        on.has(KEY.boostNoSponsored) ? text(NONE) : shown,
      ],
    });
  }
  return rows;
}
