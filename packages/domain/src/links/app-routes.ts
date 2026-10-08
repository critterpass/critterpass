/**
 * The app's screens as its router's file tree names them (`(tabs)/wallet/bookings/[id].tsx`), read
 * as path patterns so the checks that keep links honest can ask "does this path open a screen?":
 * the app's contract test for the links the server sends, and the guard that keeps servers from
 * writing those links by hand.
 */

/** A segment a route parameter fills (`[id]`). */
export const ROUTE_PARAM = '*';
/** The rest of the path, one segment or more (`[...rest]`). */
export const ROUTE_REST = '**';

export interface AppRoutePattern {
  /** The route file, relative to the app directory. */
  readonly file: string;
  /** Static segments as written; `ROUTE_PARAM` and `ROUTE_REST` for the dynamic ones. */
  readonly segments: readonly string[];
}

const ROUTE_FILE = /\.tsx?$/u;

/**
 * The pattern of a route file, or null for a file that is no screen: layouts, the router's `+`
 * files, tests. Groups in parentheses are not part of the path and `index` is its folder.
 */
export function appRoutePattern(file: string): AppRoutePattern | null {
  if (!ROUTE_FILE.test(file)) return null;
  const parts = file.replace(ROUTE_FILE, '').split('/');
  const name = parts[parts.length - 1] ?? '';
  if (name.startsWith('_') || name.startsWith('+') || name.includes('.test')) return null;
  if (parts.some((part) => part === '__tests__')) return null;
  const segments = parts
    .filter((part, index) => !(index === parts.length - 1 && part === 'index'))
    .filter((part) => !(part.startsWith('(') && part.endsWith(')')))
    .map((part) =>
      part.startsWith('[...') ? ROUTE_REST : part.startsWith('[') ? ROUTE_PARAM : part,
    );
  return { file, segments };
}

function matches(pattern: readonly string[], path: readonly string[]): boolean {
  const rest = pattern[pattern.length - 1] === ROUTE_REST;
  if (rest ? path.length < pattern.length : path.length !== pattern.length) return false;
  return pattern.every(
    (segment, index) =>
      segment === ROUTE_REST || segment === ROUTE_PARAM || segment === path[index],
  );
}

/** How exactly a pattern names a path, segment by segment: static before parameter before rest. */
function rank(pattern: readonly string[]): string {
  return pattern
    .map((segment) => (segment === ROUTE_REST ? '0' : segment === ROUTE_PARAM ? '1' : '2'))
    .join('');
}

/**
 * The route a path opens (query and fragment aside): the most exact pattern that fits, as the
 * router picks a static segment over a parameter and a parameter over the rest; null when no
 * screen has that path.
 */
export function matchAppRoute(
  patterns: readonly AppRoutePattern[],
  path: string,
): AppRoutePattern | null {
  const cut = path.search(/[?#]/u);
  const segments = (cut === -1 ? path : path.slice(0, cut))
    .split('/')
    .filter((segment) => segment !== '');
  let best: AppRoutePattern | null = null;
  for (const pattern of patterns) {
    if (!matches(pattern.segments, segments)) continue;
    if (best === null || rank(pattern.segments) > rank(best.segments)) best = pattern;
  }
  return best;
}
