import { StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';

/**
 * Reads what the screen-wide layout checks (./layout-scan) judge straight from React's committed
 * tree, so no component has to opt in: every native text with its words, the controls, the scroll
 * views, the parents that clip, the cards, and which screen (route) each belongs to. Screens that
 * are not focused (the page under a sheet, the other tabs) and hidden subtrees are left out.
 *
 * The fiber fields read here (`tag`, `type`, `memoizedProps`, `child`, `sibling`, `return`,
 * `stateNode`) are the ones React's own developer tools read, in production builds too.
 */
export interface FiberLike {
  readonly tag: number;
  readonly type: unknown;
  readonly memoizedProps: unknown;
  readonly stateNode: unknown;
  readonly child: FiberLike | null;
  readonly sibling: FiberLike | null;
  readonly return: FiberLike | null;
}

/** React's work tags this module reads. */
const HOST_ROOT = 3;
const HOST_COMPONENT = 5;
const HOST_TEXT = 6;
const CONTEXT_PROVIDER = 10;
const OFFSCREEN = 22;

const TEXT_TYPES = new Set(['RCTText']);
const SCROLL_TYPES = new Set(['RCTScrollView', 'AndroidHorizontalScrollView']);
const INPUT_TYPES = /TextInput/u;
/** Map views: their markers and labels meet by design. */
const MAP_TYPES = /^(RNMBX|AIRMap|RNMapsMap)|MapView/u;
/** Glass and blur surfaces draw a card without a background colour. */
const GLASS_TYPES = /Glass|Blur/u;
const CONTROL_ROLES = new Set([
  'button',
  'link',
  'tab',
  'switch',
  'checkbox',
  'radio',
  'togglebutton',
  'imagebutton',
  'menuitem',
]);
/** Rounder than this, a surface with a ground reads as a card. */
const CARD_RADIUS = 12;
const LABEL_WORDS = 32;

export interface TreeText {
  /** Index of its native box in `LayoutTree.boxes`. */
  readonly box: number;
  readonly words: string;
  readonly label: string;
  readonly screen: string;
  /** Box index of the scroll view it scrolls in, or null on the screen's fixed parts. */
  readonly layer: number | null;
  /** Box indexes of the controls it is part of. */
  readonly controls: readonly number[];
  readonly clip: number | null;
  readonly card: number | null;
  readonly free: boolean;
}

export interface TreeControl {
  readonly box: number;
  readonly label: string;
  readonly screen: string;
  readonly layer: number | null;
  readonly free: boolean;
}

export interface LayoutTree {
  /** Every native box a check measures, texts included. */
  readonly boxes: readonly FiberLike[];
  /** Readable names per box index, for clips and cards. */
  readonly labels: ReadonlyMap<number, string>;
  readonly texts: readonly TreeText[];
  readonly controls: readonly TreeControl[];
}

/** The contexts that say which screen a subtree belongs to and whether it is focused. */
export interface ScreenContexts {
  /** Its value is the route: `{ name }`. */
  readonly route: unknown;
  /** Its value is false for a screen that is not focused. */
  readonly focused: unknown;
}

interface Scope {
  readonly screen: string;
  readonly layer: number | null;
  readonly controls: readonly number[];
  readonly clip: number | null;
  readonly card: number | null;
  readonly free: boolean;
  readonly testId: string | null;
}

type Props = Readonly<Record<string, unknown>>;

function propsOf(fiber: FiberLike): Props {
  const props = fiber.memoizedProps;
  return typeof props === 'object' && props !== null ? (props as Props) : {};
}

function isContext(fiber: FiberLike, context: unknown): boolean {
  if (fiber.tag !== CONTEXT_PROVIDER || context === undefined) return false;
  const type = fiber.type as { _context?: unknown } | null;
  return type === context || type?._context === context;
}

function flatStyle(props: Props): ViewStyle {
  try {
    return (StyleSheet.flatten(props.style as ViewStyle) as ViewStyle | undefined) ?? {};
  } catch {
    return {};
  }
}

/** False for a colour that draws nothing (transparent, or almost all alpha gone). */
export function drawsGround(colour: unknown): boolean {
  if (colour === undefined || colour === null) return false;
  if (typeof colour !== 'string') return true;
  const value = colour.trim().toLowerCase();
  if (value === 'transparent') return false;
  const hex = /^#(?:[0-9a-f]{3}([0-9a-f])|[0-9a-f]{6}([0-9a-f]{2}))$/u.exec(value);
  if (hex) {
    const alpha =
      hex[1] !== undefined ? parseInt(hex[1] + hex[1], 16) : parseInt(hex[2] ?? 'ff', 16);
    return alpha >= 128;
  }
  const rgba = /^(?:rgba|hsla)\([^,]+,[^,]+,[^,]+,\s*([\d.]+%?)\s*\)$/u.exec(value);
  if (rgba?.[1] !== undefined) {
    const alpha = rgba[1].endsWith('%') ? parseFloat(rgba[1]) / 100 : parseFloat(rgba[1]);
    return alpha >= 0.5;
  }
  return true;
}

function radiusOf(style: ViewStyle): number {
  const corners = [
    style.borderRadius,
    style.borderTopLeftRadius,
    style.borderTopRightRadius,
    style.borderBottomLeftRadius,
    style.borderBottomRightRadius,
  ].filter((value): value is number => typeof value === 'number');
  return corners.length === 0 ? 0 : Math.max(...corners);
}

function isControl(type: string, props: Props): boolean {
  if (SCROLL_TYPES.has(type) || INPUT_TYPES.test(type) || TEXT_TYPES.has(type)) return false;
  if (type === 'RNGestureHandlerButton') return true;
  if (typeof props.onClick === 'function' || typeof props.onResponderRelease === 'function')
    return true;
  const role = props.accessibilityRole ?? props.role;
  return typeof role === 'string' && CONTROL_ROLES.has(role);
}

/** The words a native text draws: its own strings and its nested spans'. */
export function wordsOf(fiber: FiberLike): string {
  const parts: string[] = [];
  const stack: FiberLike[] = fiber.child ? [fiber.child] : [];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    if (node.sibling) stack.push(node.sibling);
    if (node.tag === HOST_TEXT && typeof node.memoizedProps === 'string')
      parts.push(node.memoizedProps);
    else if (node.child) stack.push(node.child);
  }
  return parts.join('').replace(/\s+/gu, ' ').trim();
}

function short(words: string): string {
  const chars = [...words];
  return chars.length > LABEL_WORDS ? `${chars.slice(0, LABEL_WORDS - 1).join('')}…` : words;
}

/**
 * The words in a report subject: digits stand as `#`, so a clock or a count that ticks names the
 * same text each time and is reported once.
 */
export function subjectWords(words: string): string {
  return short(words).replace(/\d/gu, '#');
}

function labelFor(own: string | null, scope: Scope, words?: string): string {
  if (own !== null) return own;
  if (words === undefined) return scope.testId ?? 'the screen';
  const quoted = `"${subjectWords(words)}"`;
  return scope.testId === null ? quoted : `${scope.testId} ${quoted}`;
}

/** The host root of the tree a native view's fiber is in. */
export function hostRootOf(fiber: FiberLike | null | undefined): FiberLike | null {
  let node = fiber ?? null;
  while (node !== null && node.tag !== HOST_ROOT) node = node.return;
  return node;
}

/** Collects what the layout checks measure, from the committed tree under `root`. */
export function collectLayoutTree(root: FiberLike, contexts: ScreenContexts): LayoutTree {
  const boxes: FiberLike[] = [];
  const labels = new Map<number, string>();
  const texts: TreeText[] = [];
  const controls: TreeControl[] = [];
  const start: Scope = {
    screen: 'app',
    layer: null,
    controls: [],
    clip: null,
    card: null,
    free: false,
    testId: null,
  };
  const stack: [FiberLike, Scope][] = root.child ? [[root.child, start]] : [];

  while (stack.length > 0) {
    const next = stack.pop();
    if (!next) continue;
    const [fiber, scope] = next;
    // Siblings share the parent's scope.
    if (fiber.sibling) stack.push([fiber.sibling, scope]);
    const props = propsOf(fiber);
    let inner = scope;

    if (isContext(fiber, contexts.focused) && props.value === false) continue;
    if (isContext(fiber, contexts.route)) {
      const name = (props.value as { name?: unknown } | undefined)?.name;
      if (typeof name === 'string') inner = { ...inner, screen: name };
    }
    if (fiber.tag === OFFSCREEN && props.mode === 'hidden') continue;
    const testId = typeof props.testID === 'string' ? props.testID : null;

    if (fiber.tag === HOST_COMPONENT && typeof fiber.type === 'string') {
      const type = fiber.type;
      const style = flatStyle(props);
      if (style.display === 'none' || style.opacity === 0) continue;
      if (TEXT_TYPES.has(type)) {
        const words = wordsOf(fiber);
        if (words !== '') {
          boxes.push(fiber);
          texts.push({
            box: boxes.length - 1,
            words,
            label: labelFor(testId, inner, words),
            screen: inner.screen,
            layer: inner.layer,
            controls: inner.controls,
            clip: inner.clip,
            card: inner.card,
            free: inner.free,
          });
        }
        // Nested spans are drawn by this text.
        continue;
      }
      const index = boxes.length;
      let used = false;
      const name = labelFor(testId, inner);
      if (SCROLL_TYPES.has(type)) {
        // What clips or holds the scroll view does not judge the content scrolling inside it.
        inner = { ...inner, layer: index, clip: null, card: null };
        used = true;
      }
      if (MAP_TYPES.test(type)) inner = { ...inner, free: true };
      if (isControl(type, props)) {
        controls.push({
          box: index,
          label: name,
          screen: inner.screen,
          layer: inner.layer,
          free: inner.free,
        });
        inner = { ...inner, controls: [...inner.controls, index] };
        used = true;
      }
      if (!SCROLL_TYPES.has(type)) {
        if (style.overflow === 'hidden') {
          inner = { ...inner, clip: index };
          used = true;
        }
        const radius = radiusOf(style);
        if (
          radius >= CARD_RADIUS &&
          (drawsGround(style.backgroundColor) || GLASS_TYPES.test(type))
        ) {
          inner = { ...inner, card: index };
          used = true;
        }
      }
      if (used) {
        boxes.push(fiber);
        labels.set(index, name);
      }
    }
    if (testId !== null) inner = { ...inner, testId };
    if (fiber.child) stack.push([fiber.child, inner]);
  }
  return { boxes, labels, texts, controls };
}
