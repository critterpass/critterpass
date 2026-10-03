/**
 * The small Markdown help articles are written in (the content factory's rules: short paragraphs,
 * at most level-two headings, bullet or numbered lists, bold, and links), parsed into blocks the
 * reader draws with the app's own text styles. Anything else reads as plain text.
 */

export type Inline =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'bold'; readonly text: string }
  | { readonly kind: 'link'; readonly text: string; readonly href: string };

export type Block =
  | { readonly kind: 'heading'; readonly text: string }
  | { readonly kind: 'paragraph'; readonly inlines: readonly Inline[] }
  | { readonly kind: 'list'; readonly ordered: boolean; readonly items: readonly Inline[][] };

const INLINE = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/gu;

export function parseInlines(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index;
    if (index > last) out.push({ kind: 'text', text: text.slice(last, index) });
    if (match[1] !== undefined) out.push({ kind: 'bold', text: match[1] });
    else out.push({ kind: 'link', text: match[2] ?? '', href: match[3] ?? '' });
    last = index + match[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

const BULLET = /^\s*[-*]\s+(.*)$/u;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/u;
const HEADING = /^#{1,6}\s+(.*)$/u;

export function parseMarkdown(markdown: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list = null as { ordered: boolean; items: Inline[][] } | null;
  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', inlines: parseInlines(paragraph.join(' ')) });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list !== null) {
      blocks.push({ kind: 'list', ordered: list.ordered, items: list.items });
      list = null;
    }
  };
  for (const raw of markdown.split(/\r?\n/u)) {
    const line = raw.trim();
    if (line === '') {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = HEADING.exec(line);
    const bullet = BULLET.exec(raw);
    const numbered = NUMBERED.exec(raw);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ kind: 'heading', text: (heading[1] ?? '').replace(/\*\*/gu, '') });
    } else if (bullet || numbered) {
      flushParagraph();
      const ordered = bullet === null;
      if (list === null || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push(parseInlines((bullet ?? numbered)?.[1] ?? ''));
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}

/** The article slug a help link points at (`/help/<slug>`), or null for any other link. */
export function helpLinkSlug(href: string): string | null {
  const match = /^\/help\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/u.exec(href);
  return match?.[1] ?? null;
}
