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

/** A dish's price as the menu prints it, read by code on the server (never by the model). */
export interface MenuPrice {
  readonly printed: string;
  /** In the currency's minor units; null when the currency is not known. */
  readonly amountMinor: number | null;
  readonly currency: string | null;
}

export interface MenuItem {
  readonly ocr_line_id: string;
  readonly translation: string;
  readonly description: string;
  readonly spice: number | null;
  readonly flags: readonly MenuFlag[];
  readonly price?: MenuPrice | null;
}

/** `POST /v1/camera/menu` as the app reads it. */
export interface MenuReading {
  readonly status: 'ok' | 'no_dishes' | 'failed';
  readonly items: readonly MenuItem[];
  readonly suggestion: string | null;
  /** Members whose flags were checked. */
  readonly checked_members: readonly string[];
  /** The language the menu is written in (BCP 47); null when the guide could not tell. */
  readonly source_language?: string | null;
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
  /** The dish as the menu writes it, without the price printed on its line. */
  readonly name: string;
  readonly translation: string;
  readonly price: MenuPrice | null;
  readonly clash: boolean;
  readonly flags: readonly MenuFlag[];
}

/** The dish's own words on its line: the printed price and the dots leading to it are left out. */
export function dishName(source: string, price: MenuPrice | null): string {
  const at = price === null ? -1 : source.lastIndexOf(price.printed);
  const name = (at <= 0 ? source : source.slice(0, at)).replace(/[\s.·…:-]+$/u, '').trim();
  return name === '' ? source.trim() : name;
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
      name: dishName(line.text, item.price ?? null),
      translation: item.translation,
      price: item.price ?? null,
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

/** What the person is ordering: how many of each dish, by the dish's line id. */
export type MenuOrder = Readonly<Record<string, number>>;

export const MENU_ORDER_MAX = 20;

/** One more or one fewer of a dish; a dish at zero leaves the order. */
export function changeOrder(order: MenuOrder, id: string, by: 1 | -1): MenuOrder {
  const count = Math.max(0, Math.min(MENU_ORDER_MAX, (order[id] ?? 0) + by));
  const { [id]: _dropped, ...rest } = order;
  return count === 0 ? rest : { ...rest, [id]: count };
}

export interface MenuOrderLine {
  readonly id: string;
  readonly count: number;
  readonly name: string;
  readonly translation: string;
}

/** The order in menu order, each dish in the menu's own words. */
export function orderLines(stickers: readonly MenuSticker[], order: MenuOrder): MenuOrderLine[] {
  return stickers.flatMap((sticker) => {
    const count = order[sticker.id] ?? 0;
    return count === 0
      ? []
      : [{ id: sticker.id, count, name: sticker.name, translation: sticker.translation }];
  });
}

/**
 * The order as a card to show the person taking it: one dish a line in the menu's language, and
 * the same in the reader's words underneath.
 */
export function orderCard(lines: readonly MenuOrderLine[]): { phrase: string; gloss: string } {
  return {
    phrase: lines.map((line) => `${line.count} × ${line.name}`).join('\n'),
    gloss: lines.map((line) => `${line.count} × ${line.translation}`).join(', '),
  };
}

/** The dishes ordered as an expense's name ("Bánh xèo, Gỏi cuốn"), cut at a whole dish. */
export function orderExpenseName(lines: readonly MenuOrderLine[], max = 60): string {
  let name = '';
  for (const line of lines) {
    const next = name === '' ? line.name : `${name}, ${line.name}`;
    if (next.length > max) break;
    name = next;
  }
  return name === '' ? (lines[0]?.name.slice(0, max) ?? '') : name;
}
