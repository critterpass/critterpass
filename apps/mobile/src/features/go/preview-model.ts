/**
 * What the GO preview shows, from where the phone is, the route answer, the signal and the ride
 * quote. The road line needs both a position and signal; without either the preview opens on the
 * place, with no line, and Start still hands off (the maps app finds the person itself). When the
 * router could not answer, the minutes are straight-line "about" minutes and the line is drawn
 * straight and dashed, never as if it followed the roads.
 */
/* eslint-disable lingui/no-unlocalized-strings -- states and wire values, never copy. */
import {
  decodePolyline,
  estimateStraightLineEta,
  type LngLat,
  type RideQuoteResult,
} from '@cp/domain';

import { WALK_FIRST_MAX_M, type GoMode, type GoPoint } from './maps-handoff';

/** Encoded route shapes come at precision 5 (the api simplifies them like stored legs). */
const SHAPE_PRECISION = 5;

export interface PreviewLeg {
  readonly minutes: number;
  readonly meters: number;
  readonly shape: string | null;
  readonly approx: boolean;
  readonly source: 'valhalla' | 'straight_line';
}

export interface RoutePreview {
  readonly walk: PreviewLeg;
  readonly drive: PreviewLeg;
}

export type LocateState =
  | { readonly kind: 'locating' }
  | { readonly kind: 'here'; readonly at: GoPoint }
  /** Location is off for the app, or the person said no. */
  | { readonly kind: 'denied' }
  /** Allowed, but no fix came. */
  | { readonly kind: 'no_fix' };

export type RouteState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly preview: RoutePreview }
  | { readonly kind: 'offline' }
  | { readonly kind: 'error' };

export type RideState =
  | { readonly kind: 'none' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly quote: RideQuoteResult };

export interface ModeMinutes {
  readonly minutes: number;
  /** A straight-line estimate: say "about". */
  readonly approx: boolean;
}

export type GrabRow =
  | {
      readonly kind: 'fare';
      readonly lowMinor: number;
      readonly highMinor: number;
      readonly currency: string;
      readonly etaMin: number;
      readonly url: string;
    }
  /** Grab runs here but gave no estimate: Ride still opens it with the drop-off filled in. */
  | { readonly kind: 'link'; readonly url: string; readonly fallbackUrl: string };

export type PreviewStatus =
  'locating' | 'routing' | 'routed' | 'straight' | 'no_location' | 'offline';

export interface PreviewState {
  readonly status: PreviewStatus;
  readonly you: GoPoint | null;
  readonly minutes: { readonly walk: ModeMinutes; readonly drive: ModeMinutes } | null;
  /** `[lng, lat]` from you to the place for the selected mode; null hides the line. */
  readonly line: readonly LngLat[] | null;
  /** The line is a straight stand-in, drawn dashed. */
  readonly lineStraight: boolean;
  readonly grab: GrabRow | null;
}

export interface PreviewInput {
  readonly place: GoPoint;
  readonly locate: LocateState;
  readonly route: RouteState;
  readonly online: boolean;
  readonly mode: GoMode;
  readonly ride: RideState;
}

/** Grab's own fare when it gave one, else its link when it runs here, else nothing. */
export function grabRow(ride: RideState): GrabRow | null {
  if (ride.kind !== 'ready') return null;
  const estimate = ride.quote.estimate;
  if (estimate !== null) {
    return {
      kind: 'fare',
      lowMinor: estimate.fare_low_minor,
      highMinor: estimate.fare_high_minor,
      currency: estimate.currency,
      etaMin: estimate.eta_min,
      url: estimate.deep_link,
    };
  }
  const link = ride.quote.links.find((candidate) => candidate.provider === 'grab');
  return link === undefined
    ? null
    : { kind: 'link', url: link.app_url, fallbackUrl: link.fallback_url };
}

function straightMinutes(from: GoPoint, to: GoPoint, mode: GoMode): ModeMinutes {
  const eta = estimateStraightLineEta({
    originLat: from.lat,
    originLng: from.lng,
    destLat: to.lat,
    destLng: to.lng,
    mode: mode === 'walk' ? 'pedestrian' : 'auto',
  });
  return { minutes: eta.minutes, approx: true };
}

const straightLine = (from: GoPoint, to: GoPoint): LngLat[] => [
  [from.lng, from.lat],
  [to.lng, to.lat],
];

export function previewState(input: PreviewInput): PreviewState {
  const grab = grabRow(input.ride);
  const empty = { you: null, minutes: null, line: null, lineStraight: false, grab };
  const { locate, route, place } = input;
  if (locate.kind === 'locating') return { ...empty, status: 'locating' };
  if (locate.kind !== 'here') return { ...empty, status: 'no_location' };
  const you = locate.at;
  if (!input.online || route.kind === 'offline') {
    return { ...empty, you, status: 'offline' };
  }
  if (route.kind === 'idle' || route.kind === 'loading') {
    return { ...empty, you, status: 'routing' };
  }
  if (route.kind === 'error') {
    return {
      status: 'straight',
      you,
      minutes: {
        walk: straightMinutes(you, place, 'walk'),
        drive: straightMinutes(you, place, 'drive'),
      },
      line: straightLine(you, place),
      lineStraight: true,
      grab,
    };
  }
  const { walk, drive } = route.preview;
  const leg = input.mode === 'walk' ? walk : drive;
  const shape = leg.shape === null ? [] : decodePolyline(leg.shape, SHAPE_PRECISION);
  const routed = shape.length >= 2;
  return {
    status: routed ? 'routed' : 'straight',
    you,
    minutes: {
      walk: { minutes: walk.minutes, approx: walk.approx },
      drive: { minutes: drive.minutes, approx: drive.approx },
    },
    line: routed ? shape : straightLine(you, place),
    lineStraight: !routed,
    grab,
  };
}

/** The mode the preview starts in: on foot when the walk is short, else by car. */
export function firstMode(preview: RoutePreview | null, straightMeters: number | null): GoMode {
  const meters = preview?.walk.meters ?? straightMeters;
  return meters === null || meters <= WALK_FIRST_MAX_M ? 'walk' : 'drive';
}
