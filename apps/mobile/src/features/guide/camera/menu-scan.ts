/**
 * Point and ask (3j-3) as the screen shows it: aim, take one still, the phone reads its lines,
 * and the guide's reading of the menu comes back keyed by line id. Each dish becomes a sticker on
 * its own line of the still; a dish that clashes with what a crew member eats turns pink and
 * carries that member's chip. Prices are never shown from here: the menu's own print stays
 * visible under the stickers.
 */
/* eslint-disable lingui/no-unlocalized-strings -- phase and issue codes, never copy. */
export type MenuPhase = 'aiming' | 'capturing' | 'reading' | 'result';

/** Why a scan stopped short; each has its own line. */
export type MenuIssue =
  | 'no_camera'
  | 'camera_denied'
  | 'capture_failed'
  | 'no_text'
  | 'unsupported_script'
  | 'offline'
  | 'quota'
  | 'fair_use'
  | 'no_dishes'
  | 'failed';

export interface MenuStill {
  readonly uri: string;
  /** The upright image the boxes refer to, in pixels. */
  readonly width: number;
  readonly height: number;
}

export interface MenuLine {
  readonly id: string;
  readonly text: string;
  /** Left, top, width and height as fractions of the still. */
  readonly bbox: readonly [number, number, number, number];
}

export interface MenuFlag {
  readonly member: string;
  readonly verdict: 'ok' | 'clash';
  readonly reason: string;
}

export interface MenuItem {
  readonly ocr_line_id: string;
  readonly translation: string;
  readonly description: string;
  readonly spice: number | null;
  readonly flags: readonly MenuFlag[];
}

/** `POST /v1/camera/menu` as the app reads it. */
export interface MenuReading {
  readonly status: 'ok' | 'no_dishes' | 'failed';
  readonly items: readonly MenuItem[];
  readonly suggestion: string | null;
  /** Members whose flags were checked. */
  readonly checked_members: readonly string[];
}

export interface MenuScanState {
  readonly phase: MenuPhase;
  readonly still: MenuStill | null;
  readonly lines: readonly MenuLine[];
  readonly reading: MenuReading | null;
  readonly issue: MenuIssue | null;
}

export const MENU_AIMING: MenuScanState = {
  phase: 'aiming',
  still: null,
  lines: [],
  reading: null,
  issue: null,
};

export type MenuScanEvent =
  | { readonly type: 'capturing' }
  | { readonly type: 'captured'; readonly still: MenuStill; readonly lines: readonly MenuLine[] }
  | { readonly type: 'read'; readonly reading: MenuReading }
  | { readonly type: 'failed'; readonly issue: MenuIssue }
  | { readonly type: 'retake' };

/** Issues that leave the still on screen (the photo was fine; the reading was not). */
const KEEPS_STILL: ReadonlySet<MenuIssue> = new Set<MenuIssue>([
  'offline',
  'quota',
  'fair_use',
  'no_dishes',
  'failed',
]);

export function menuScanReducer(state: MenuScanState, event: MenuScanEvent): MenuScanState {
  switch (event.type) {
    case 'capturing':
      return state.phase === 'aiming' ? { ...MENU_AIMING, phase: 'capturing' } : state;
    case 'captured':
      return state.phase === 'capturing'
        ? { ...state, phase: 'reading', still: event.still, lines: event.lines }
        : state;
    case 'read':
      return state.phase === 'reading'
        ? { ...state, phase: 'result', reading: event.reading }
        : state;
    case 'failed':
      // A photo that could be read stays up, with the way out being another photo.
      return state.still !== null && KEEPS_STILL.has(event.issue)
        ? { ...state, phase: 'result', reading: null, issue: event.issue }
        : { ...MENU_AIMING, issue: event.issue };
    case 'retake':
      return MENU_AIMING;
  }
}

export interface MenuSticker {
  readonly id: string;
  /** Where the dish's line sits, as fractions of the still. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly source: string;
  readonly translation: string;
  readonly clash: boolean;
  readonly flags: readonly MenuFlag[];
}

/** One sticker per dish the guide read, on the line the phone found it on, top to bottom. */
export function menuStickers(
  lines: readonly MenuLine[],
  reading: MenuReading | null,
): MenuSticker[] {
  if (reading === null) return [];
  const byId = new Map(lines.map((line) => [line.id, line]));
  const stickers: MenuSticker[] = [];
  for (const item of reading.items) {
    const line = byId.get(item.ocr_line_id);
    if (line === undefined) continue;
    const [x, y, width, height] = line.bbox;
    stickers.push({
      id: item.ocr_line_id,
      x,
      y,
      width,
      height,
      source: line.text,
      translation: item.translation,
      clash: item.flags.some((flag) => flag.verdict === 'clash'),
      flags: item.flags,
    });
  }
  return stickers.sort((a, b) => a.y - b.y);
}

/** Whether any dietary flag is on screen: the advisory line shows whenever this is true. */
export function showsFlags(reading: MenuReading | null): boolean {
  return reading !== null && reading.items.some((item) => item.flags.length > 0);
}

/** The dishes as a short list for a follow-up question ("Nasi campur (mixed rice plate)"). */
export function dishList(stickers: readonly MenuSticker[]): string {
  return stickers.map((sticker) => `${sticker.source} (${sticker.translation})`).join(', ');
}
