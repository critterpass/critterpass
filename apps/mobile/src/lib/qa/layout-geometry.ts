import type { QaRect } from './header-overlap';
import {
  contains,
  describeRect,
  intersect,
  onScreen,
  overlaps,
  sidesPast,
  tightSides,
  TOUCH_PT,
  bottom,
} from './layout-rects';
import type { UiQaCode } from './ui-qa';

/**
 * The geometry of the screen-wide layout checks (./layout-scan): what one settled, measured screen
 * shows that the design never allows. Pure functions over window rectangles, in points.
 *
 * - TEXT_OVERLAP: two texts' glyphs drawn over each other (day tags piled up, a title on a date).
 * - TEXT_OVER_CONTROL: a text and a control it is not part of drawn over each other (an eyebrow
 *   under the back button, a title running under a row's more button).
 * - TEXT_CLIPPED: a text cut by an ancestor that clips its children (a headline running past a
 *   card's rounded edge, a footnote cut at its foot).
 * - TEXT_PAST_PADDING: a text inside a card that reaches the card's edge (the card lost its inner
 *   padding).
 * - TEXT_UNDER_STATUS_BAR: a text drawn under the status bar before anyone scrolls (a page that
 *   grew past the screen's top, a header placed without the top safe area).
 *
 * What is covered is not judged: a text under a surface drawn later (the next card of a deck, a
 * sheet over its page, a panel over a photo) does not show. Content in a scroll view moves under
 * the screen's fixed parts by design, so a fixed control or text is only judged against scrolled
 * content when that content is at rest at the top and the fixed part sits in the header band.
 */

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
  | 'CONTROL_MISALIGNED'
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

/** A surface with a ground of its own, which hides what was drawn before it. */
export interface PlacedGround {
  readonly key: string;
  /** Its place in drawing order. */
  readonly paint: number;
  readonly rect: QaRect;
}

export interface Placed {
  /** Names the box in a report: its testID, or its nearest testID ancestor and its words. */
  readonly label: string;
  readonly rect: QaRect;
  /** The screen (route) it belongs to: boxes of different screens are never compared. */
  readonly screen: string;
  readonly layer: PlacedLayer | null;
  /** Inside a map, whose labels may meet by design. */
  readonly free: boolean;
  /** Its place in drawing order: a later box draws over an earlier one. */
  readonly paint: number;
  /** The grounds it sits on, outermost first. */
  readonly grounds: readonly PlacedGround[];
}

export interface PlacedText extends Placed {
  /** Where its glyphs draw (./layout-rects `inkOf`). */
  readonly ink: QaRect;
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

/** `region` of `lower` is hidden by a ground `upper` sits on that was drawn after `lower`. */
export function covered(lower: Placed, upper: Placed, region: QaRect): boolean {
  const own = new Set(lower.grounds.map((ground) => ground.key));
  return upper.grounds.some(
    (ground) => ground.paint > lower.paint && !own.has(ground.key) && contains(ground.rect, region),
  );
}

function hiddenEither(a: Placed, b: Placed, region: QaRect): boolean {
  return a.paint < b.paint ? covered(a, b, region) : covered(b, a, region);
}

function isCard(r: QaRect): boolean {
  return r.width >= CARD_MIN_WIDTH && r.height >= CARD_MIN_HEIGHT;
}

function pairProblems(
  shown: readonly PlacedText[],
  controls: readonly PlacedControl[],
  window: LayoutInput['window'],
): LayoutProblem[] {
  const problems: LayoutProblem[] = [];
  shown.forEach((text, index) => {
    for (const other of shown.slice(index + 1)) {
      if (!comparable(text, other, window) || !overlaps(text.ink, other.ink)) continue;
      if (hiddenEither(text, other, intersect(text.ink, other.ink))) continue;
      problems.push({
        code: 'TEXT_OVERLAP',
        subject: `${text.screen}: ${text.label} overlaps ${other.label}`,
        detail: `(${describeRect(text.ink)}; ${describeRect(other.ink)})`,
      });
    }
    for (const control of controls) {
      if (text.controls.includes(control.key)) continue;
      if (!comparable(text, control, window) || !overlaps(text.ink, control.rect)) continue;
      // A control laid over the whole text is the row it reads as (a tap area over a card).
      if (contains(control.rect, text.rect)) continue;
      if (hiddenEither(text, control, intersect(text.ink, control.rect))) continue;
      problems.push({
        code: 'TEXT_OVER_CONTROL',
        subject: `${text.screen}: ${text.label} under ${control.label}`,
        detail: `(${describeRect(text.ink)}; ${describeRect(control.rect)})`,
      });
    }
  });
  return problems;
}

function boxProblems(text: PlacedText, topInset: number): LayoutProblem | null {
  const { clip, card, ink } = text;
  const resting = text.layer === null || text.layer.atRest;
  if (resting && !text.free && ink.y < topInset - TOUCH_PT) {
    return {
      code: 'TEXT_UNDER_STATUS_BAR',
      subject: `${text.screen}: ${text.label}`,
      detail: `(glyphs from ${String(Math.round(ink.y))}pt, the status bar ends at ${String(Math.round(topInset))}pt; ${describeRect(ink)})`,
    };
  }
  if (clip && overlaps(clip.rect, ink)) {
    const past = sidesPast(clip.rect, ink);
    if (past.length > 0)
      return {
        code: 'TEXT_CLIPPED',
        subject: `${text.screen}: ${text.label} cut by ${clip.label}`,
        detail: `(${past.join(', ')}; ${describeRect(ink)} in ${describeRect(clip.rect)})`,
      };
  }
  if (card && isCard(card.rect) && overlaps(card.rect, text.rect)) {
    const tight = tightSides(card.rect, text.rect, CARD_INSET_PT);
    if (tight.length > 0)
      return {
        code: 'TEXT_PAST_PADDING',
        subject: `${text.screen}: ${text.label} at the edge of ${card.label}`,
        detail: `(room ${tight.join(', ')}, at least ${String(CARD_INSET_PT)}pt; ${describeRect(text.rect)} in ${describeRect(card.rect)})`,
      };
  }
  return null;
}

/** Every problem one measured screen shows, one per pair or text. */
export function layoutProblems({
  texts,
  controls,
  window,
  topInset = 0,
}: LayoutInput): LayoutProblem[] {
  const shown = texts.filter((t) => onScreen(t.ink, window));
  const shownControls = controls.filter((c) => onScreen(c.rect, window));
  const problems = pairProblems(shown, shownControls, window);
  for (const text of shown) {
    const problem = boxProblems(text, topInset);
    if (problem) problems.push(problem);
  }
  return problems;
}
