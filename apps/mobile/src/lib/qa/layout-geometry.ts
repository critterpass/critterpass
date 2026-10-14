import type { QaRect } from './header-overlap';
import type { UiQaCode } from './ui-qa';

/**
 * The geometry of the screen-wide layout checks (./layout-scan): what one settled, measured screen
 * shows that the design never allows. Pure functions over window rectangles, in points.
 *
 * - TEXT_OVERLAP: two texts drawn over each other (day tags piled up, a title under a date).
 * - TEXT_OVER_CONTROL: a text drawn under a control it is not part of (an eyebrow under the back
 *   button, a title running under a row's more button).
 * - TEXT_CLIPPED: a text cut by an ancestor that clips its children (a headline running past a
 *   card's rounded edge, a footnote cut at its foot).
 * - TEXT_PAST_PADDING: a text inside a card that reaches the card's edge (the card lost its inner
 *   padding).
 * - TEXT_UNDER_STATUS_BAR: a text drawn under the status bar before anyone scrolls (a page that
 *   grew past the screen's top, a header placed without the top safe area).
 *
 * Content in a scroll view moves under the screen's fixed parts by design, so a fixed control or
 * text is only judged against scrolled content when that content is at rest at the top and the
 * fixed part sits in the header band: what a floating header covers before anyone scrolls.
 */

/** Anti-aliasing and rounding: edges this close only touch. */
export const TOUCH_PT = 1;
/** Two boxes must share more than this on both axes to count as drawn over each other. */
export const OVERLAP_PT = 2;
/** The least room a text keeps from its card's edges. */
export const CARD_INSET_PT = 6;
/** Smaller rounded surfaces are pills, tags and chips: their labels sit tight by design. */
export const CARD_MIN_WIDTH = 120;
export const CARD_MIN_HEIGHT = 56;
/** The top share of the window a floating header occupies. */
export const HEADER_BAND = 0.3;

export type LayoutCode = Extract<
  UiQaCode,
  | 'TEXT_OVERLAP'
  | 'TEXT_OVER_CONTROL'
  | 'TEXT_CLIPPED'
  | 'TEXT_PAST_PADDING'
  | 'TEXT_UNDER_STATUS_BAR'
>;

export interface LayoutProblem {
  readonly code: LayoutCode;
  readonly subject: string;
  readonly detail: string;
}

/** A layer: the screen's fixed parts (`null`) or one scroll view's content. */
export interface PlacedLayer {
  readonly id: string;
  /** The scroll view shows its first content (offset 0); unknown counts as scrolled. */
  readonly atRest: boolean;
}

interface Placed {
  /** Names the box in a report: its testID, or its nearest testID ancestor and its words. */
  readonly label: string;
  readonly rect: QaRect;
  /** The screen (route) it belongs to: boxes of different screens are never compared. */
  readonly screen: string;
  readonly layer: PlacedLayer | null;
  /** Inside a map or another surface whose labels may meet by design. */
  readonly free: boolean;
}

export interface PlacedText extends Placed {
  /** Keys of the controls this text is part of. */
  readonly controls: readonly string[];
  /** The nearest ancestor (within its layer) that clips its children. */
  readonly clip?: { readonly label: string; readonly rect: QaRect } | undefined;
  /** The nearest card (a rounded surface) it sits on, within its layer. */
  readonly card?: { readonly label: string; readonly rect: QaRect } | undefined;
}

export interface PlacedControl extends Placed {
  readonly key: string;
}

export interface LayoutInput {
  readonly texts: readonly PlacedText[];
  readonly controls: readonly PlacedControl[];
  readonly window: { readonly width: number; readonly height: number };
  /** The window's top safe-area inset: the status bar, and the camera housing below it. */
  readonly topInset?: number;
}

const right = (r: QaRect) => r.x + r.width;
const bottom = (r: QaRect) => r.y + r.height;

/** How far two boxes share each axis (negative when apart). */
function shared(a: QaRect, b: QaRect): { dx: number; dy: number } {
  return {
    dx: Math.min(right(a), right(b)) - Math.max(a.x, b.x),
    dy: Math.min(bottom(a), bottom(b)) - Math.max(a.y, b.y),
  };
}

export function overlaps(a: QaRect, b: QaRect): boolean {
  const { dx, dy } = shared(a, b);
  return dx > OVERLAP_PT && dy > OVERLAP_PT;
}

export function contains(outer: QaRect, inner: QaRect): boolean {
  return (
    inner.x >= outer.x - TOUCH_PT &&
    inner.y >= outer.y - TOUCH_PT &&
    right(inner) <= right(outer) + TOUCH_PT &&
    bottom(inner) <= bottom(outer) + TOUCH_PT
  );
}

/** Drawn and at least partly inside the window. */
export function onScreen(r: QaRect, window: LayoutInput['window']): boolean {
  if (r.width <= TOUCH_PT || r.height <= TOUCH_PT) return false;
  const { dx, dy } = shared(r, { x: 0, y: 0, ...window });
  return dx > TOUCH_PT && dy > TOUCH_PT;
}

/**
 * Whether two boxes of one screen are judged against each other: the same layer always; a fixed
 * box in the header band against content at rest; otherwise never (content scrolls under fixed
 * parts by design).
 */
export function comparable(a: Placed, b: Placed, window: LayoutInput['window']): boolean {
  if (a.screen !== b.screen || a.free || b.free) return false;
  if (a.layer?.id === b.layer?.id) return true;
  const fixed = a.layer === null ? a : b.layer === null ? b : null;
  const moving = fixed === a ? b : a;
  if (fixed === null || moving.layer === null || !moving.layer.atRest) return false;
  return bottom(fixed.rect) <= window.height * HEADER_BAND;
}

const round = (n: number) => Math.round(n);
export function describeRect(r: QaRect): string {
  return `x=${String(round(r.x))} y=${String(round(r.y))} w=${String(round(r.width))} h=${String(round(r.height))}`;
}

/** Room `inner` keeps from each edge of `outer` (negative past it). */
function insets(outer: QaRect, inner: QaRect): [string, number][] {
  return [
    ['top', inner.y - outer.y],
    ['bottom', bottom(outer) - bottom(inner)],
    ['left', inner.x - outer.x],
    ['right', right(outer) - right(inner)],
  ];
}

/** The sides of `inner` past `outer`, by how much: `bottom 6pt, right 12pt`. */
export function sidesPast(outer: QaRect, inner: QaRect): string[] {
  return insets(outer, inner)
    .filter(([, room]) => room < -TOUCH_PT)
    .map(([side, room]) => `${side} ${String(round(-room))}pt`);
}

/** The sides of `inner` closer than `least` to the edges of `outer`, with the room they keep. */
export function tightSides(outer: QaRect, inner: QaRect, least: number): string[] {
  return insets(outer, inner)
    .filter(([, room]) => room < least - TOUCH_PT)
    .map(([side, room]) => `${side} ${String(round(room))}pt`);
}

function isCard(r: QaRect): boolean {
  return r.width >= CARD_MIN_WIDTH && r.height >= CARD_MIN_HEIGHT;
}

/** Every problem one measured screen shows, one per pair or text. */
export function layoutProblems({
  texts,
  controls,
  window,
  topInset = 0,
}: LayoutInput): LayoutProblem[] {
  const problems: LayoutProblem[] = [];
  const shown = texts.filter((t) => onScreen(t.rect, window));
  const shownControls = controls.filter((c) => onScreen(c.rect, window));

  shown.forEach((text, index) => {
    for (const other of shown.slice(index + 1)) {
      if (!comparable(text, other, window) || !overlaps(text.rect, other.rect)) continue;
      problems.push({
        code: 'TEXT_OVERLAP',
        subject: `${text.screen}: ${text.label} overlaps ${other.label}`,
        detail: `(${describeRect(text.rect)}; ${describeRect(other.rect)})`,
      });
    }
    for (const control of shownControls) {
      if (text.controls.includes(control.key)) continue;
      if (!comparable(text, control, window) || !overlaps(text.rect, control.rect)) continue;
      // A control laid over the whole text is the row it reads as (a tap area over a card).
      if (contains(control.rect, text.rect)) continue;
      problems.push({
        code: 'TEXT_OVER_CONTROL',
        subject: `${text.screen}: ${text.label} under ${control.label}`,
        detail: `(${describeRect(text.rect)}; ${describeRect(control.rect)})`,
      });
    }
  });

  for (const text of shown) {
    const { clip, card } = text;
    const resting = text.layer === null || text.layer.atRest;
    if (resting && !text.free && text.rect.y < topInset - TOUCH_PT) {
      problems.push({
        code: 'TEXT_UNDER_STATUS_BAR',
        subject: `${text.screen}: ${text.label}`,
        detail: `(top at ${String(round(text.rect.y))}pt, the status bar ends at ${String(round(topInset))}pt; ${describeRect(text.rect)})`,
      });
      continue;
    }
    if (clip && overlaps(clip.rect, text.rect)) {
      const past = sidesPast(clip.rect, text.rect);
      if (past.length > 0) {
        problems.push({
          code: 'TEXT_CLIPPED',
          subject: `${text.screen}: ${text.label} cut by ${clip.label}`,
          detail: `(${past.join(', ')}; ${describeRect(text.rect)} in ${describeRect(clip.rect)})`,
        });
        continue;
      }
    }
    if (card && isCard(card.rect) && overlaps(card.rect, text.rect)) {
      const tight = tightSides(card.rect, text.rect, CARD_INSET_PT);
      if (tight.length > 0)
        problems.push({
          code: 'TEXT_PAST_PADDING',
          subject: `${text.screen}: ${text.label} at the edge of ${card.label}`,
          detail: `(room ${tight.join(', ')}, at least ${String(CARD_INSET_PT)}pt; ${describeRect(text.rect)} in ${describeRect(card.rect)})`,
        });
    }
  }
  return problems;
}
