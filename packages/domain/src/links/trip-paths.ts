/**
 * In-app paths of a trip's hub and its day-of screen, as notifications, inbox rows and briefing
 * lines link them, and the former paths of every screen a link was once written for. Pushes
 * already delivered and rows already written keep the path they were sent with, so
 * `currentAppPath` reads each former shape as the screen it names today.
 */
const TRIP_ID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const DAY = '\\d{4}-\\d{2}-\\d{2}|today';
const TRIP_DAY = new RegExp(`^/(?:hub|trips)/(${TRIP_ID})/day/(${DAY})/?$`, 'iu');

export function tripHubPath(tripId: string): string {
  return `/trips/${tripId}`;
}

export function tripDayPath(tripId: string, localDate: string): string {
  return `/trips/${tripId}/day/${localDate}`;
}

const ID = '[^/?#]+';

/**
 * Former path shapes and the path of the same screen today. Trip hub and day links were written
 * under `/hub`; money's pushed screens under the wallet tab; a Help share named a session page
 * that was never built (the crew map draws the sharer); a briefing line's balance, open vote and
 * queued answer named `/money`, `/polls/<id>` and a guide with no thread (`new` is the guide's
 * current one).
 */
const FORMER_PATHS: readonly (readonly [RegExp, (...parts: string[]) => string])[] = [
  [new RegExp(`^/hub/(${TRIP_ID})/day/(${DAY})/?$`, 'iu'), tripDayPath],
  [new RegExp(`^/hub/(${TRIP_ID})/?$`, 'iu'), tripHubPath],
  [new RegExp(`^/wallet/money/payment/(${ID})/?$`, 'u'), (id) => `/money/payment/${id}`],
  [new RegExp(`^/wallet/money/expense/(${ID})/?$`, 'u'), (id) => `/money/expense/${id}`],
  [/^\/wallet\/money\/settle\/?$/u, () => '/money/settle'],
  [new RegExp(`^/help/(${ID})/session/${ID}/?$`, 'u'), (tripId) => `/map/${tripId}`],
  [/^\/money\/?$/u, () => '/wallet/money'],
  [new RegExp(`^/polls/(${ID})/?$`, 'u'), (pollId) => `/vote/${pollId}`],
  [/^\/guide\/?$/u, () => '/guide/new'],
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
