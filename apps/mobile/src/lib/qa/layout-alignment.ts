import type { QaRect } from './header-overlap';
import {
  comparable,
  type LayoutInput,
  type LayoutProblem,
  type PlacedControl,
  type PlacedText,
} from './layout-geometry';
import { bottom, describeRect, onScreen, right, TOUCH_PT } from './layout-rects';

/**
 * CONTROL_MISALIGNED: a text button stacked right under a wide button whose words are centred,
 * on the same surface, with its own words off that centre ("Cancel the draft" set at the left edge
 * under a centred COME BACK LATER). The design centres the pair or sets both at the edge.
 */

/** A button this far under another is stacked with it. */
const STACK_GAP_PT = 32;
/** A wide button spans this share of the window or more. */
const WIDE_SHARE = 0.6;
/** Centres this close are the same centre. */
const CENTRE_PT = 12;

const centre = (r: QaRect) => r.x + r.width / 2;

function innermostGround(control: PlacedControl): string | null {
  return control.grounds.at(-1)?.key ?? null;
}

/** The one text a control holds, or null when it holds none or several. */
function textOf(control: PlacedControl, texts: readonly PlacedText[]): PlacedText | null {
  const own = texts.filter((text) => text.controls.at(-1) === control.key);
  return own.length === 1 ? (own[0] ?? null) : null;
}

function wordsOf(control: PlacedControl, texts: readonly PlacedText[]): QaRect | null {
  return textOf(control, texts)?.ink ?? null;
}

const within = (inner: QaRect, outer: QaRect) =>
  inner.x >= outer.x - 1 &&
  inner.y >= outer.y - 1 &&
  right(inner) <= right(outer) + 1 &&
  bottom(inner) <= bottom(outer) + 1;

/**
 * A tap target that draws its own surface (a pill, a code field, a tappable card) sets its words
 * where its surface puts them: it is not a bare text button paired with the button above.
 */
function drawsOwnSurface(control: PlacedControl, texts: readonly PlacedText[]): boolean {
  if (control.ownGround === true) return true;
  const card = textOf(control, texts)?.card;
  return card !== undefined && within(card.rect, control.rect);
}

/** Developer tools' entries are not the product's buttons. */
const DEV_TOOL = /^dev-/u;

export function alignmentProblems({ texts, controls, window }: LayoutInput): LayoutProblem[] {
  const shown = controls.filter(
    (control) => onScreen(control.rect, window) && !DEV_TOOL.test(control.label),
  );
  const problems: LayoutProblem[] = [];
  for (const upper of shown) {
    if (upper.rect.width < window.width * WIDE_SHARE) continue;
    const upperWords = wordsOf(upper, texts);
    if (upperWords === null || Math.abs(centre(upperWords) - centre(upper.rect)) > CENTRE_PT)
      continue;
    for (const lower of shown) {
      if (lower === upper || !comparable(upper, lower, window)) continue;
      if (innermostGround(lower) !== innermostGround(upper)) continue;
      const gap = lower.rect.y - bottom(upper.rect);
      if (gap < -TOUCH_PT || gap > STACK_GAP_PT) continue;
      // A row of chips or tabs under a field: its buttons sit side by side, not centred.
      const inRow = shown.some(
        (other) =>
          other !== lower &&
          other !== upper &&
          innermostGround(other) === innermostGround(lower) &&
          Math.min(bottom(other.rect), bottom(lower.rect)) - Math.max(other.rect.y, lower.rect.y) >
            lower.rect.height / 2,
      );
      if (inRow || drawsOwnSurface(lower, texts)) continue;
      const words = wordsOf(lower, texts);
      if (words === null || words.width >= upper.rect.width * WIDE_SHARE) continue;
      if (words.x < upper.rect.x - TOUCH_PT || right(words) > right(upper.rect) + TOUCH_PT)
        continue;
      const off = centre(words) - centre(upperWords);
      if (Math.abs(off) <= CENTRE_PT) continue;
      problems.push({
        code: 'CONTROL_MISALIGNED',
        subject: `${upper.screen}: ${lower.label} off the centre of ${upper.label}`,
        detail: `(its words ${String(Math.round(Math.abs(off)))}pt ${off < 0 ? 'left' : 'right'} of the centre; ${describeRect(words)} under ${describeRect(upper.rect)})`,
      });
    }
  }
  return problems;
}
