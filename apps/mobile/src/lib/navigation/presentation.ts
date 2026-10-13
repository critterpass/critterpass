/**
 * How the premium UI presents each sheet and modal route, by its path under `app/`, and where a
 * screen sits in the navigation tree (which decides its leading control). Pure data and pure
 * functions: the shell turns a presentation into navigator options
 * (`ui/premium/shell/navigation/presentation-options.ts`) and reads the placement in its screen
 * scaffolds.
 *
 * Why the root needs this list: a native stack never presents its first screen as a sheet or a
 * modal. A route opened from another area (New poll from the crew chat, the boarding pass from a
 * booking) is the first screen of its own group's stack, so the root stack presents the whole
 * group the way that first screen is presented here, and the group's own stack presents the same
 * route the same way when it opens over one of the group's pages.
 *
 * - `sheet`: a native form sheet with its grabber and detents (fractions of the screen, or `fit`
 *   to the content); swipe down dismisses, a dirty `SheetScreen` asks first.
 * - `modal`: the native page sheet: nearly full height, the page behind steps back, swipe down
 *   dismisses.
 * - `cover`: a full-screen cover with its ✕; `fade` for reveal moments that take no gesture.
 * - `drawn`: the screen still draws its own entrance over a see-through card (the current UI's
 *   `Sheet` and `RiseModal`, the premium pages that slide themselves in).
 */

export type SheetDetents = readonly number[] | 'fit';

export type ScreenPresentation =
  | { readonly kind: 'sheet'; readonly detents: SheetDetents }
  | { readonly kind: 'modal' }
  | { readonly kind: 'cover'; readonly fade?: boolean }
  | { readonly kind: 'drawn' };

const HALF: ScreenPresentation = { kind: 'sheet', detents: [0.5] };
const FULL: ScreenPresentation = { kind: 'sheet', detents: [1] };
const FIT: ScreenPresentation = { kind: 'sheet', detents: 'fit' };
const MODAL: ScreenPresentation = { kind: 'modal' };
const COVER: ScreenPresentation = { kind: 'cover' };
const REVEAL: ScreenPresentation = { kind: 'cover', fade: true };
const DRAWN: ScreenPresentation = { kind: 'drawn' };
const sheet = (...detents: number[]): ScreenPresentation => ({ kind: 'sheet', detents });

/**
 * Every premium sheet and modal route a person can open from another area. Covers that an area
 * layout gives `FULL_SCREEN_ROUTE_OPTIONS` (a fade, no gesture) are `REVEAL` here, so the root
 * presents them the same way.
 */
const PRESENTATIONS: Readonly<Record<string, ScreenPresentation>> = {
  // The `(modal)` group: covers, the guide thread as a page sheet, the supplier sheets, and the
  // screens that still draw themselves.
  '(modal)/guide/[threadId]': MODAL,
  '(modal)/guide/dietary': COVER,
  '(modal)/guide/phrase': COVER,
  '(modal)/guide/camera': COVER,
  '(modal)/guide/voice': COVER,
  '(modal)/guide/practice': COVER,
  '(modal)/bookings/pass/[id]': COVER,
  '(modal)/hatch/[tripId]': REVEAL,
  '(modal)/sticker/[stickerId]': FIT,
  '(modal)/supplier/offer': FULL,
  '(modal)/supplier/book': FULL,
  '(modal)/supplier/draft': FULL,
  '(modal)/supplier/messages': FULL,
  '(modal)/supplier/cancel': FIT,
  '(modal)/supplier/estimate': FIT,
  '(modal)/supplier/log-ride': FIT,
  '(modal)/boost/[tripId]': DRAWN,
  '(modal)/boost/stamped': DRAWN,
  '(modal)/paywall/index': DRAWN,
  '(modal)/paywall/welcome': DRAWN,
  '(modal)/paywall/compare': DRAWN,
  // Areas.
  'crew/index': DRAWN,
  'crew/new': COVER,
  'crew/[crewId]/invite': FULL,
  'crew/[crewId]/member/[uid]': FIT,
  'vote/new-poll': FULL,
  'vote/pitch': FULL,
  'vote/[pollId]/reveal': REVEAL,
  'places/search': REVEAL,
  'explore/why-sponsored': FIT,
  'you/appearance': HALF,
  'you/past-trip': FULL,
  'money/add': REVEAL,
  'money/scan': REVEAL,
  'memory/[memoryId]': COVER,
  '(trip)/lock-screen-offer': FIT,
  '(trip)/sos/[id]': REVEAL,
  '(trip)/sos/send': REVEAL,
  '(trip)/proposal/[id]/board': REVEAL,
  '(trip)/proposal/[id]/trailer': REVEAL,
  '(trip)/album/[tripId]/[photoId]': REVEAL,
  '(trip)/recap/[tripId]/story': REVEAL,
  '(trip)/encounter/[id]': REVEAL,
  '(trip)/[tripId]/add/[placeId]': sheet(0.79, 1),
  '(trip)/[tripId]/search/link': sheet(0.9, 1),
  '(trip)/[tripId]/check/gap': sheet(0.62, 1),
  '(trip)/[tripId]/drivers/pick': sheet(0.6, 1),
  '(trip)/[tripId]/ideas/index': sheet(0.82, 1),
  '(trip)/[tripId]/settings/dates': MODAL,
  '(trip)/[tripId]/draft/change-day': FULL,
  '(trip)/[tripId]/draft/last-redraft': FIT,
  '(trip)/[tripId]/setup/must-dos/add': FULL,
  '(trip)/[tripId]/setup/ask/[askId]': FIT,
};

/** Every listed route path (each names a route file under `app/`). */
export const PRESENTED_ROUTES: readonly string[] = Object.keys(PRESENTATIONS);

/** Children of `(modal)` not listed above are the current UI's self-animated sheets. */
const MODAL_GROUP = '(modal)';

/** The premium presentation of a route by its path under `app/`; undefined for a pushed page. */
export function presentationOf(path: string): ScreenPresentation | undefined {
  const listed = PRESENTATIONS[path];
  if (listed !== undefined) return listed;
  // The bare group: opened before its first screen is known.
  return path === MODAL_GROUP || path.startsWith(`${MODAL_GROUP}/`) ? DRAWN : undefined;
}

/** A navigation route as the root stack's options callback receives it. */
export interface OpenedRoute {
  readonly name: string;
  readonly params?: object | undefined;
}

interface HeldStack {
  readonly routes?: readonly OpenedRoute[];
}

/**
 * The navigator's child state held on the route: react-navigation keeps a nested navigator's state
 * under a private symbol until it lands in `route.state`, and only that copy is current during the
 * render that opened it.
 */
function childStack(route: OpenedRoute): readonly OpenedRoute[] | undefined {
  const held = Object.getOwnPropertySymbols(route).find(
    (symbol) => symbol.description === 'CHILD_STATE',
  );
  const landed = (route as { readonly state?: HeldStack }).state;
  const stack =
    held === undefined
      ? landed
      : ((route as unknown as Record<symbol, HeldStack | undefined>)[held] ?? landed);
  return Array.isArray(stack?.routes) ? stack.routes : undefined;
}

interface NestedParams {
  readonly screen?: unknown;
  readonly params?: unknown;
}

/**
 * The path a group was opened on: its name, then the first screen of each nested stack below it
 * (`(trip)/[tripId]/add/[placeId]`). Before a nested navigator has rendered there is no stack to
 * read, only the `screen` params the link was opened with.
 */
export function openedPath(route: OpenedRoute): string {
  const names = [route.name];
  let current = route;
  for (;;) {
    const first = childStack(current)?.[0];
    if (first !== undefined) {
      names.push(first.name);
      current = first;
      continue;
    }
    let params = current.params as NestedParams | undefined;
    while (typeof params?.screen === 'string') {
      names.push(params.screen);
      params = params.params as NestedParams | undefined;
    }
    return names.join('/');
  }
}

/** One navigator level as the placement reads it, from the screen up to the root. */
export interface NavigatorLevel {
  /** `stack` or `tab` (anything else counts as a stack). */
  readonly type: string;
  /** The index in this navigator of the route that holds the screen. */
  readonly index: number;
}

/**
 * Where a screen sits, which decides its leading control:
 * - `root`: a tab's first screen (`tab`), or the app's first screen with nothing under it (a cold
 *   link straight into a page): no back of its own, so a page offers the way Home;
 * - `pushed`: pushed on a stack, its own or its group's: the glass back `<`;
 * - `presented`: the first screen of a sheet or modal (its own, or its group's): ✕ or Cancel.
 */
export type ScreenPlacement =
  | { readonly kind: 'root'; readonly tab: boolean }
  | { readonly kind: 'pushed'; readonly ownStack: boolean }
  | {
      readonly kind: 'presented';
      readonly presentation: ScreenPresentation;
      /** Presented by its own stack; false when its group is presented as it. */
      readonly ownStack: boolean;
    };

/**
 * Walks up from the screen while it (or the group holding it) is the first route of its stack.
 * The first level where it is not decides: a route pushed there is `pushed`, one presented there
 * is `presented`. A screen pushed in its own stack reads its presentation from that stack
 * (`ownPresentation`); a group's presentation comes from the list above, keyed by the screen's
 * full path, because the group shows as its first screen.
 */
export function screenPlacement(
  levels: readonly NavigatorLevel[],
  fullPath: string,
  ownPresentation: ScreenPresentation | undefined,
): ScreenPlacement {
  for (const [depth, level] of levels.entries()) {
    if (level.type === 'tab') return { kind: 'root', tab: true };
    if (level.index === 0) continue;
    const presentation = depth === 0 ? ownPresentation : presentationOf(fullPath);
    if (presentation !== undefined)
      return { kind: 'presented', presentation, ownStack: depth === 0 };
    return { kind: 'pushed', ownStack: depth === 0 };
  }
  return { kind: 'root', tab: false };
}
