import { NavigationRouteContext } from 'expo-router/build/react-navigation/core/NavigationProvider';
import { IsFocusedContext } from 'expo-router/build/react-navigation/core/useIsFocused';
import { Dimensions } from 'react-native';
import { initialWindowMetrics } from 'react-native-safe-area-context';

import type { QaMeasurable, QaRect } from './header-overlap';
import { alignmentProblems } from './layout-alignment';
import {
  layoutProblems,
  type PlacedControl,
  type PlacedGround,
  type PlacedLayer,
  type PlacedText,
} from './layout-geometry';
import { inkOf, TOUCH_PT, type QaLine } from './layout-rects';
import { collectLayoutTree, hostRootOf, type FiberLike, type LayoutTree } from './layout-tree';
import { reportUiQa, UI_QA_ENABLED } from './ui-qa';

/**
 * The screen-wide layout checks: once a screen's text layouts settle, the focused screens of the
 * committed tree (./layout-tree) are measured and judged (./layout-geometry), and each problem is
 * a `[ui-qa]` report naming the screen and the text's testID or nearest testID ancestor.
 *
 * No component opts in. Every premium text already runs the text checks (./text-layout-check)
 * inside its native layout event; while that event is dispatched, React Native holds it in
 * `global.event`, whose `currentTarget` is the text's native element. That element leads to the
 * tree's root once; every text layout keeps the text's lines (where its glyphs draw) and restarts
 * the settle timer. Navigation restarts it too (./back-affordance), for a screen shown again
 * without a new layout.
 *
 * Cost: development and e2e builds only; one timer per burst of layouts, then two measuring passes
 * over the focused screens' texts and the boxes around them.
 */

/** Quiet time after the last text layout before a screen is measured. */
export const LAYOUT_SETTLE_MS = 900;
/** Between the samples that must agree before a screen is judged (a push slides in by transform). */
const SAMPLE_MS = 350;
const MAX_SAMPLES = 6;

interface FiberRootLike {
  readonly current: FiberLike;
}

interface NativeElementLike extends QaMeasurable {
  readonly __internalInstanceHandle?: FiberLike;
  readonly scrollTop?: unknown;
  readonly scrollLeft?: unknown;
}

interface FabricUiManager {
  measureInWindow(node: unknown, done: (x: number, y: number, w: number, h: number) => void): void;
}

let root: FiberRootLike | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
/** Each native text's lines, by the instance React keeps for it across commits. */
let linesByText = new WeakMap<object, readonly QaLine[]>();

function fabric(): FabricUiManager | undefined {
  return (globalThis as { nativeFabricUIManager?: FabricUiManager }).nativeFabricUIManager;
}

function hostState(fiber: FiberLike): {
  node?: unknown;
  canonical?: { publicInstance?: NativeElementLike | null };
} {
  const state = fiber.stateNode;
  return typeof state === 'object' && state !== null ? state : {};
}

/** A native box's element when React made one, else a measurer over its shadow node. */
function measurable(fiber: FiberLike): NativeElementLike | null {
  const state = hostState(fiber);
  const element = state.canonical?.publicInstance;
  if (element && typeof element.measureInWindow === 'function') return element;
  const ui = fabric();
  if (state.node === undefined || ui === undefined) return null;
  return { measureInWindow: (done) => ui.measureInWindow(state.node, done) };
}

function measureAll(boxes: readonly FiberLike[], done: (rects: (QaRect | null)[]) => void): void {
  const rects: (QaRect | null)[] = boxes.map(() => null);
  let left = boxes.length;
  if (left === 0) {
    done(rects);
    return;
  }
  boxes.forEach((fiber, index) => {
    const element = measurable(fiber);
    const settle = () => {
      left -= 1;
      if (left === 0) done(rects);
    };
    if (element === null) {
      settle();
      return;
    }
    try {
      element.measureInWindow((x, y, width, height) => {
        rects[index] = { x, y, width, height };
        settle();
      });
    } catch {
      settle();
    }
  });
}

function sameRects(a: readonly (QaRect | null)[], b: readonly (QaRect | null)[]): boolean {
  return a.every((rect, index) => {
    const other = b[index];
    if (!rect || !other) return rect === other;
    return (
      Math.abs(rect.x - other.x) <= TOUCH_PT &&
      Math.abs(rect.y - other.y) <= TOUCH_PT &&
      Math.abs(rect.width - other.width) <= TOUCH_PT &&
      Math.abs(rect.height - other.height) <= TOUCH_PT
    );
  });
}

function atRest(fiber: FiberLike): boolean {
  const element = hostState(fiber).canonical?.publicInstance;
  const top = element?.scrollTop;
  const left = element?.scrollLeft;
  return typeof top === 'number' && typeof left === 'number' && top <= 1 && left <= 1;
}

function linesOf(fiber: FiberLike): readonly QaLine[] | undefined {
  const canonical = hostState(fiber).canonical;
  return canonical ? linesByText.get(canonical) : undefined;
}

/** The measured tree as the geometry reads it; boxes that did not measure are left out. */
export function placeTree(
  tree: LayoutTree,
  rects: readonly (QaRect | null)[],
  layerAtRest: (box: number) => boolean,
): { texts: PlacedText[]; controls: PlacedControl[] } {
  const layers = new Map<number, PlacedLayer>();
  const layer = (box: number | null): PlacedLayer | null => {
    if (box === null) return null;
    let known = layers.get(box);
    if (!known) {
      known = { id: String(box), atRest: layerAtRest(box) };
      layers.set(box, known);
    }
    return known;
  };
  const around = (box: number | null) => {
    const rect = box === null ? null : rects[box];
    if (box === null || !rect) return undefined;
    return { label: tree.labels.get(box) ?? 'a parent', rect };
  };
  const grounds = (boxes: readonly number[]): PlacedGround[] =>
    boxes.flatMap((box) => {
      const rect = rects[box];
      const paint = tree.paints.get(box);
      return rect && paint !== undefined ? [{ key: String(box), paint, rect }] : [];
    });
  const texts: PlacedText[] = [];
  for (const text of tree.texts) {
    const rect = rects[text.box];
    if (!rect) continue;
    texts.push({
      label: text.label,
      rect,
      ink: inkOf(rect, text.lines),
      lineCount: text.lines?.length,
      screen: text.screen,
      layer: layer(text.layer),
      free: text.free,
      paint: text.paint,
      grounds: grounds(text.grounds),
      controls: text.controls.map(String),
      clip: around(text.clip),
      card: around(text.card),
    });
  }
  const controls: PlacedControl[] = [];
  for (const control of tree.controls) {
    const rect = rects[control.box];
    if (!rect) continue;
    controls.push({
      key: String(control.box),
      label: control.label,
      rect,
      screen: control.screen,
      layer: layer(control.layer),
      free: control.free,
      paint: control.paint,
      grounds: grounds(control.grounds),
    });
  }
  return { texts, controls };
}

function judge(tree: LayoutTree, rects: readonly (QaRect | null)[]): void {
  const window = Dimensions.get('window');
  const placed = placeTree(tree, rects, (box) => {
    const fiber = tree.boxes[box];
    return fiber !== undefined && atRest(fiber);
  });
  const topInset = initialWindowMetrics?.insets.top ?? 0;
  const input = { ...placed, window, topInset };
  for (const problem of [...layoutProblems(input), ...alignmentProblems(input)])
    reportUiQa(problem.code, problem.subject, problem.detail);
}

function scan(): void {
  timer = null;
  if (root === null) return;
  const tree = collectLayoutTree(root.current, {
    route: NavigationRouteContext,
    focused: IsFocusedContext,
    linesOf,
  });
  const sample = (previous: (QaRect | null)[] | null, count: number) => {
    measureAll(tree.boxes, (rects) => {
      if (previous !== null && sameRects(previous, rects)) {
        judge(tree, rects);
        return;
      }
      if (count >= MAX_SAMPLES) return;
      timer = setTimeout(() => sample(rects, count + 1), SAMPLE_MS);
    });
  };
  sample(null, 1);
}

/** Measures the focused screens once their layouts have been quiet for a moment. */
export function scheduleLayoutScan(): void {
  if (!UI_QA_ENABLED || root === null) return;
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(scan, LAYOUT_SETTLE_MS);
}

/**
 * Called inside a text's native layout event: finds the tree's root from the event's element the
 * first time, then schedules a scan.
 */
export function noteTextLayoutEvent(): void {
  if (!UI_QA_ENABLED) return;
  const event = (
    globalThis as {
      event?: { currentTarget?: unknown; nativeEvent?: { lines?: readonly QaLine[] } };
    }
  ).event;
  const element = event?.currentTarget as NativeElementLike | null | undefined;
  const fiber = element?.__internalInstanceHandle;
  const canonical = fiber ? hostState(fiber).canonical : undefined;
  const lines = event?.nativeEvent?.lines;
  if (canonical && Array.isArray(lines)) linesByText.set(canonical, lines);
  if (root === null) {
    const hostRoot = hostRootOf(fiber);
    const state = hostRoot?.stateNode as FiberRootLike | undefined;
    if (state?.current === undefined) return;
    root = state;
  }
  scheduleLayoutScan();
}

/** Forgets the root and any pending scan (tests). */
export function resetLayoutScan(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  root = null;
  linesByText = new WeakMap();
}
