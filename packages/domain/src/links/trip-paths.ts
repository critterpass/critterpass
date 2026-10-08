/**
 * The former paths of the screens a link was once written for. Pushes already delivered and rows
 * already written keep the path they were sent with, so `currentAppPath` reads each former shape
 * as the screen `app-links.ts` names today.
 */
import {
  crewMapLink,
  expenseLink,
  guideThreadLink,
  moneyLink,
  paymentLink,
  settleLink,
  tripDayLink,
  tripHubLink,
  voteLink,
} from './app-links';

const TRIP_ID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const DAY = '\\d{4}-\\d{2}-\\d{2}|today';
const TRIP_DAY = new RegExp(`^/(?:hub|trips)/(${TRIP_ID})/day/(${DAY})/?$`, 'iu');

const ID = '[^/?#]+';
/** The guide's current thread, where a link names none. */
const NEW_THREAD = 'new';

/**
 * Former path shapes and the path of the same screen today. Trip hub and day links were written
 * under `/hub`; money's pushed screens under the wallet tab; a Help share named a session page
 * that was never built (the crew map draws the sharer); a briefing line's balance, open vote and
 * queued answer named `/money`, `/polls/<id>` and a guide with no thread (`new` is the guide's
 * current one).
 */
const FORMER_PATHS: readonly (readonly [RegExp, (...parts: string[]) => string])[] = [
  [new RegExp(`^/hub/(${TRIP_ID})/day/(${DAY})/?$`, 'iu'), tripDayLink],
  [new RegExp(`^/hub/(${TRIP_ID})/?$`, 'iu'), tripHubLink],
  [new RegExp(`^/wallet/money/payment/(${ID})/?$`, 'u'), paymentLink],
  [new RegExp(`^/wallet/money/expense/(${ID})/?$`, 'u'), expenseLink],
  [/^\/wallet\/money\/settle\/?$/u, settleLink],
  [new RegExp(`^/help/(${ID})/session/${ID}/?$`, 'u'), crewMapLink],
  [/^\/money\/?$/u, moneyLink],
  [new RegExp(`^/polls/(${ID})/?$`, 'u'), voteLink],
  [/^\/guide\/?$/u, () => guideThreadLink(NEW_THREAD)],
];

/**
 * The path the app has a screen for. A former path becomes today's, keeping its query and
 * fragment; anything else is returned unchanged.
 */
export function currentAppPath(path: string): string {
  const cut = path.search(/[?#]/u);
  const pathname = cut === -1 ? path : path.slice(0, cut);
  for (const [former, current] of FORMER_PATHS) {
    const match = former.exec(pathname);
    if (match === null) continue;
    const next = current(...match.slice(1));
    return cut === -1 ? next : `${next}${path.slice(cut)}`;
  }
  return path;
}

/** The trip and day a day-of path names, in either shape; null for any other path. */
export function tripDayOfPath(path: string): { tripId: string; localDate: string } | null {
  const match = TRIP_DAY.exec(path.trim());
  const tripId = match?.[1];
  const localDate = match?.[2];
  return tripId === undefined || localDate === undefined ? null : { tripId, localDate };
}
