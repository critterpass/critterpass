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

/** The ink of the one text a control holds, or null when it holds none or several. */
function wordsOf(control: PlacedControl, texts: readonly PlacedText[]): QaRect | null {
  const own = texts.filter((text) => text.controls.at(-1) === control.key);
  return own.length === 1 ? (own[0]?.ink ?? null) : null;
}

export function alignmentProblems({ texts, controls, window }: LayoutInput): LayoutProblem[] {
  const shown = controls.filter((control) => onScreen(control.rect, window));
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
