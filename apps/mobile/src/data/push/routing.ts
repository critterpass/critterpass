/**
 * Notification tap → in-app route, on both platforms. iOS taps arrive as expo-notifications
 * responses (the `cp` block sits in the APNs payload); Android taps come from the app's own
 * messaging service (modules/cp-notifications) already decoded. Either way the push's `deeplink`
 * (`/crew/<id>/chat`, or a full `critterpass://` / https link) goes through the deep-link router,
 * so gating (onboarding, membership) is the same as for any other link. A push without a link
 * opens the inbox. The leave-by alarm's tap opens GO, the route from here to that trip's next stop,
 * which falls back to the day the link names when that stop can't be placed.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer: routes and URL schemes. */
import { tripDayOfPath } from '@cp/domain';

import { routeIncomingUrl } from '@/lib/links/router';

export interface PushTap {
  /** The notification id; null for a conversation shortcut. */
  readonly nid: string | null;
  readonly deeplink: string | null;
  readonly type: string | null;
  readonly crewId: string | null;
}

export const TAP_FALLBACK_ROUTE = '/inbox';

/** The scheme bare deep-link paths are read under; every variant's router accepts it. */
const TAP_SCHEME = 'critterpass';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** A tap from a `cp` block, given as the object (APNs) or its JSON string (FCM data). */
export function tapFromCp(cp: unknown): PushTap | null {
  let block = cp;
  if (typeof block === 'string') {
    try {
      block = JSON.parse(block) as unknown;
    } catch {
      return null;
    }
  }
  if (!isRecord(block)) return null;
  const nid = text(block['nid']);
  if (nid === null) return null;
  return {
    nid,
    deeplink: text(block['deeplink']),
    type: text(block['type']),
    crewId: text(block['crew_id']),
  };
}

/** The slice of an expo-notifications `Notification` the `cp` block can be read from. */
export interface NotificationLike {
  readonly request: {
    readonly content: { readonly data?: unknown };
    readonly trigger?: unknown;
  };
}

/**
 * The `cp` block of a notification: iOS keeps the whole APNs payload in `trigger.payload`, Android
 * the FCM data in `trigger.remoteMessage.data`; a local notification carries it in `content.data`.
 */
export function tapFromNotification(notification: NotificationLike): PushTap | null {
  const trigger = notification.request.trigger;
  const candidates: unknown[] = [];
  if (isRecord(trigger)) {
    const payload = trigger['payload'];
    if (isRecord(payload)) candidates.push(payload['cp']);
    const remote = trigger['remoteMessage'];
    if (isRecord(remote) && isRecord(remote['data'])) candidates.push(remote['data']['cp']);
  }
  const data = notification.request.content.data;
  if (isRecord(data)) candidates.push(data['cp']);
  for (const candidate of candidates) {
    const tap = tapFromCp(candidate);
    if (tap !== null) return tap;
  }
  return null;
}

/**
 * The URL a deep link is routed as: bare paths (`/crew/<id>/chat`) under the app scheme, full
 * links unchanged; null for nothing usable.
 */
export function tapUrl(deeplink: string | null): string | null {
  const link = deeplink?.trim() ?? '';
  if (link === '') return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(link)) return link;
  if (!link.startsWith('/') || link.startsWith('//')) return null;
  return `${TAP_SCHEME}:/${link}`;
}

export type RouteUrl = (url: string) => Promise<string>;

const LEAVE_BY_ALARM = 'leave_by_alarm';

/**
 * The leave-by alarm's tap: GO for that trip's next leave-by (the `/go` route's `trip` +
 * `leaveBy=next`), carrying `dayHref` (where the tap opened before GO) for GO to open instead when
 * the leave-by has no place to go to. Null for any other push, or when the day link was routed
 * somewhere else (onboarding, another notice): that answer stands.
 */
export function leaveByGoRoute(tap: PushTap, dayHref: string): string | null {
  if (tap.type !== LEAVE_BY_ALARM) return null;
  // The push links the day it is on (`/trips/<trip id>/day/<date>`, or the former hub path).
  const tripId = tripDayOfPath(tap.deeplink ?? '')?.tripId;
  if (tripId === undefined || !dayHref.startsWith('/') || !dayHref.includes(tripId)) return null;
  return `/go?${new URLSearchParams({ trip: tripId, leaveBy: 'next', fallback: dayHref }).toString()}`;
}

/** The in-app href a tap opens. */
export async function routeForTap(
  tap: PushTap,
  route: RouteUrl = routeIncomingUrl,
): Promise<string> {
  const url = tapUrl(tap.deeplink);
  if (url === null) return TAP_FALLBACK_ROUTE;
  let href: string;
  try {
    href = await route(url);
  } catch {
    return TAP_FALLBACK_ROUTE;
  }
  return leaveByGoRoute(tap, href) ?? href;
}

export interface TapRouter {
  /** Routes a tap once: the same notification reported twice (launch + listener) navigates once. */
  handle(tap: PushTap | null): Promise<void>;
}

export function createTapRouter(deps: {
  readonly navigate: (href: string) => void;
  readonly route?: RouteUrl;
  readonly onError?: (error: unknown) => void;
}): TapRouter {
  const seen = new Set<string>();
  return {
    async handle(tap) {
      if (tap === null) return;
      if (tap.nid !== null) {
        if (seen.has(tap.nid)) return;
        seen.add(tap.nid);
      }
      try {
        deps.navigate(await routeForTap(tap, deps.route));
      } catch (error) {
        deps.onError?.(error);
      }
    },
  };
}
