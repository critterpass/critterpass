/**
 * In-app paths of a trip's hub and its day-of screen, as notifications, inbox rows and briefing
 * lines link them. Both screens live in the TRIPS tab (`/trips/<trip id>`); rows and pushes sent
 * earlier carry `/hub/<trip id>` shapes, which `currentAppPath` reads as the same screens.
 */
const TRIP_ID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const DAY = '\\d{4}-\\d{2}-\\d{2}|today';
const FORMER_HUB = new RegExp(`^/hub/(${TRIP_ID})(?:/day/(${DAY}))?/?$`, 'iu');
const TRIP_DAY = new RegExp(`^/(?:hub|trips)/(${TRIP_ID})/day/(${DAY})/?$`, 'iu');

export function tripHubPath(tripId: string): string {
  return `/trips/${tripId}`;
}

export function tripDayPath(tripId: string, localDate: string): string {
  return `/trips/${tripId}/day/${localDate}`;
}

/**
 * The path the app has a screen for. A former hub or day path becomes today's; anything else
 * (query and fragment included) is returned unchanged.
 */
export function currentAppPath(path: string): string {
  const cut = path.search(/[?#]/u);
  const pathname = cut === -1 ? path : path.slice(0, cut);
  const match = FORMER_HUB.exec(pathname);
  const tripId = match?.[1];
  if (tripId === undefined) return path;
  const date = match?.[2];
  const next = date === undefined ? tripHubPath(tripId) : tripDayPath(tripId, date);
  return cut === -1 ? next : `${next}${path.slice(cut)}`;
}

/** The trip and day a day-of path names, in either shape; null for any other path. */
export function tripDayOfPath(path: string): { tripId: string; localDate: string } | null {
  const match = TRIP_DAY.exec(path.trim());
  const tripId = match?.[1];
  const localDate = match?.[2];
  return tripId === undefined || localDate === undefined ? null : { tripId, localDate };
}
