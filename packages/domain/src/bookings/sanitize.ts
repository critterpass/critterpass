/**
 * Turning a confirmation email's HTML into what the parsers read: its schema.org JSON-LD blocks
 * (read as data, never run), its microdata reservation properties, and plain text with scripts,
 * styles, tracking pixels, hidden blocks and comments removed. The text is capped so one enormous
 * newsletter cannot fill the model's window. Pure string work: no DOM, no network, nothing loaded.
 */

/** Longest plain text handed to the extractor. */
export const MAX_EMAIL_TEXT_CHARS = 20_000;

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  euro: '€',
  pound: '£',
  yen: '¥',
  middot: '·',
  hellip: '…',
  times: '×',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (match, name: string) => {
    if (name.startsWith('#x') || name.startsWith('#X')) {
      const code = Number.parseInt(name.slice(2), 16);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    if (name.startsWith('#')) {
      const code = Number.parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[name.toLowerCase()] ?? match;
  });
}

/** Every `<script type="application/ld+json">` block that parses as JSON, flattened. */
export function extractJsonLd(html: string): unknown[] {
  const blocks: unknown[] = [];
  const pattern =
    /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/giu;
  for (const match of html.matchAll(pattern)) {
    const body = decodeEntities((match[1] ?? '').trim());
    try {
      const parsed: unknown = JSON.parse(body);
      if (Array.isArray(parsed)) blocks.push(...(parsed as unknown[]));
      else if (parsed !== null && typeof parsed === 'object' && '@graph' in parsed) {
        const graph: unknown = parsed['@graph'];
        if (Array.isArray(graph)) blocks.push(...(graph as unknown[]));
        else blocks.push(graph);
      } else blocks.push(parsed);
    } catch {
      // A malformed block is ignored; the text path still reads the email.
    }
  }
  return blocks;
}

export interface MicrodataReservation {
  readonly type: string;
  /** `itemprop` → first value (a `content`, `datetime` or `href` attribute, else the element text). */
  readonly props: Readonly<Record<string, string>>;
}

/**
 * schema.org microdata reservations (`itemtype=".../FlightReservation"` and friends): the flat
 * property values inside each reservation's element, first value per name. Nested items (the
 * airline, the airports, the hotel) contribute their properties under `parent.child`.
 */
export function extractMicrodata(html: string): MicrodataReservation[] {
  const reservations: MicrodataReservation[] = [];
  const starts = [
    ...html.matchAll(
      /<[a-z0-9]+\b[^>]*itemtype\s*=\s*["']https?:\/\/schema\.org\/(\w*Reservation)["'][^>]*>/giu,
    ),
  ];
  for (const [index, start] of starts.entries()) {
    const from = start.index ?? 0;
    const to = starts[index + 1]?.index ?? html.length;
    const scope = html.slice(from, to);
    const props: Record<string, string> = {};
    const stack: string[] = [];
    const tags = /<([a-z0-9]+)\b([^>]*)>([^<]*)/giu;
    for (const tag of scope.matchAll(tags)) {
      const attrs = tag[2] ?? '';
      const prop = /itemprop\s*=\s*["']([^"']+)["']/iu.exec(attrs)?.[1];
      if (prop === undefined) continue;
      const nested = /itemscope/iu.test(attrs);
      const value =
        /(?:content|datetime|href)\s*=\s*["']([^"']*)["']/iu.exec(attrs)?.[1] ??
        (tag[3] ?? '').trim();
      if (nested) {
        stack.splice(0, stack.length, prop);
        continue;
      }
      const key =
        stack.length > 0 && !/^(reservation|underName)/u.test(prop) ? `${stack[0]}.${prop}` : prop;
      if (value !== '' && props[key] === undefined) props[key] = decodeEntities(value);
    }
    reservations.push({ type: start[1] ?? 'Reservation', props });
  }
  return reservations;
}

/** Plain text of an HTML email, without anything that runs, tracks or hides. */
export function htmlToText(html: string): string {
  const stripped = html
    .replace(/<!--[\s\S]*?-->/gu, ' ')
    .replace(/<(script|style|head|noscript|template|svg|iframe|object)\b[\s\S]*?<\/\1\s*>/giu, ' ')
    // Blocks the sender hid from the reader (preheaders, tracking payloads).
    .replace(
      /<([a-z0-9]+)\b[^>]*style\s*=\s*["'][^"']*display\s*:\s*none[^"']*["'][^>]*>[\s\S]*?<\/\1\s*>/giu,
      ' ',
    )
    .replace(/<img\b[^>]*>/giu, ' ')
    .replace(/<(br|hr)\b[^>]*>/giu, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|table|section|article|header|footer)\s*>/giu, '\n')
    .replace(/<\/(td|th)\s*>/giu, ' ')
    .replace(/<[^>]+>/gu, ' ');
  return normaliseText(decodeEntities(stripped));
}

/** Collapses whitespace, drops zero-width and control characters, and caps the length. */
export function normaliseText(text: string): string {
  const cleaned = text
    .replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/gu, '')
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, '')
    .replace(/[ \t\u00A0]+/gu, ' ')
    .replace(/ *\n */gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
  return cleaned.length > MAX_EMAIL_TEXT_CHARS ? cleaned.slice(0, MAX_EMAIL_TEXT_CHARS) : cleaned;
}
