/**
 * Every place a paywall or an offer can appear (docs/product-decisions.md §3 "Paywall governor"
 * table), with what it offers, whether the daily governor counts it, and the contexts it never
 * shows in. The client's `usePaywall` and the server's push router read this one catalogue.
 */
import { z } from 'zod';

export const PAYWALL_ENTRY_POINTS = [
  /** Inline card after the day's last free guide answer. */
  'guide_limit',
  /** Submitting a redraft with one free redraft left. */
  'redraft_last',
  /** A seventh seat via any join path. */
  'seat_cap',
  /** Opening the crew live map on an unboosted trip (dismissed per trip). */
  'live_map',
  /** "Put this on the lock screen" on the crew map. */
  'lock_screen_map',
  /** The free boost is ending: push three days before plus the recap card. */
  'ftf_ending',
  /** "Mail a real one" on a postcard. */
  'postcard',
  /** Tapping a locked widget. */
  'widget_locked',
  /** The crew's boost card in chat (counts toward the daily cap). */
  'boost_card',
  /** Explicit navigation: plan chips, Your plan, the widget gallery. */
  'pass_chip',
  'plan_page',
  'widget_gallery',
] as const;
export const paywallEntryPointSchema = z.enum(PAYWALL_ENTRY_POINTS);
export type PaywallEntryPoint = z.infer<typeof paywallEntryPointSchema>;

export const PAYWALL_OUTCOMES = [
  'shown',
  'dismissed',
  'quiet_no',
  'purchased_pass',
  'purchased_boost',
] as const;
export const paywallOutcomeSchema = z.enum(PAYWALL_OUTCOMES);
export type PaywallOutcome = z.infer<typeof paywallOutcomeSchema>;

/** Screen contexts a governed paywall never interrupts. */
export const PAYWALL_SUPPRESS_CONTEXTS = [
  /** Trip day screens (today, leave-by, day-of hub). */
  'day_of',
  'help',
  /** SOS, including its map. */
  'sos',
  /** Delay and disruption flows. */
  'disruption',
] as const;
export type PaywallSuppressContext = (typeof PAYWALL_SUPPRESS_CONTEXTS)[number];

/** How the app or the server raised it. */
export const PAYWALL_CHANNELS = ['app', 'push', 'crew_card'] as const;
export const paywallChannelSchema = z.enum(PAYWALL_CHANNELS);
export type PaywallChannel = z.infer<typeof paywallChannelSchema>;

export type PaywallOffer = 'pass' | 'boost' | 'pass_or_boost' | 'boost_or_waitlist';

export interface PaywallEntry {
  readonly offer: PaywallOffer;
  /** Counts toward, and is limited by, the one-a-day cap. Explicit navigation is exempt. */
  readonly governed: boolean;
  /** A quiet no (✕, "Maybe later", "Stay free") hides the entry for that trip. */
  readonly quietNoPerTrip: boolean;
  readonly suppressContexts: readonly PaywallSuppressContext[];
}

const EVERYWHERE_QUIET = PAYWALL_SUPPRESS_CONTEXTS;

export const PAYWALL_ENTRIES: Readonly<Record<PaywallEntryPoint, PaywallEntry>> = {
  guide_limit: {
    offer: 'pass',
    governed: true,
    quietNoPerTrip: true,
    suppressContexts: EVERYWHERE_QUIET,
  },
  redraft_last: {
    offer: 'boost',
    governed: true,
    quietNoPerTrip: true,
    suppressContexts: EVERYWHERE_QUIET,
  },
  seat_cap: {
    offer: 'boost_or_waitlist',
    governed: true,
    quietNoPerTrip: true,
    suppressContexts: EVERYWHERE_QUIET,
  },
  // Per-trip dismissal only: the teaser is the map's own locked state, not an interruption.
  live_map: {
    offer: 'boost',
    governed: false,
    quietNoPerTrip: true,
    suppressContexts: ['help', 'sos'],
  },
  lock_screen_map: {
    offer: 'boost',
    governed: true,
    quietNoPerTrip: true,
    suppressContexts: EVERYWHERE_QUIET,
  },
  ftf_ending: {
    offer: 'pass_or_boost',
    governed: true,
    quietNoPerTrip: true,
    suppressContexts: EVERYWHERE_QUIET,
  },
  postcard: {
    offer: 'pass',
    governed: true,
    quietNoPerTrip: true,
    suppressContexts: EVERYWHERE_QUIET,
  },
  widget_locked: {
    offer: 'pass_or_boost',
    governed: true,
    quietNoPerTrip: true,
    suppressContexts: EVERYWHERE_QUIET,
  },
  boost_card: {
    offer: 'boost',
    governed: true,
    quietNoPerTrip: false,
    suppressContexts: EVERYWHERE_QUIET,
  },
  pass_chip: { offer: 'pass', governed: false, quietNoPerTrip: false, suppressContexts: [] },
  plan_page: { offer: 'pass', governed: false, quietNoPerTrip: false, suppressContexts: [] },
  widget_gallery: {
    offer: 'pass_or_boost',
    governed: false,
    quietNoPerTrip: false,
    suppressContexts: [],
  },
};
