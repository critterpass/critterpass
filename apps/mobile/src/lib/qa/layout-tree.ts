import { StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';

import type { QaLine } from './layout-rects';

/**
 * Reads what the screen-wide layout checks (./layout-scan) judge straight from React's committed
 * tree, so no component has to opt in: every native text with its words, the controls, the scroll
 * views, the parents that clip, the cards and the grounds that cover what was drawn before them, in
 * drawing order, and which screen (route) each belongs to. Screens that are not focused (the page
 * under a sheet, the other tabs), hidden subtrees and artwork (a view read as one image, such as a
 * stamp or a sticker, whose words are drawn into it) are left out.
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
const ART_ROLES = new Set(['image', 'img']);
/**
 * The native screen a stack draws each route in: iOS draws a sheet or modal in its own component
 * (react-native-screens picks `RNSModalScreen` for every presentation but a push), whose content is
 * measured from the sheet's top.
 */
const SCREEN_TYPES = new Set(['RNSScreen', 'RNSModalScreen']);

/**
 * Presentations a native stack shows in a surface of its own (a sheet, a modal card): its content
 * is measured from that surface's top, never from under the status bar.
 */
const OWN_SURFACE = new Set([
  'modal',
  'transparentModal',
  'formSheet',
  'pageSheet',
  'containedModal',
  'containedTransparentModal',
]);
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
  /** Its place in drawing order (pre-order over the native boxes). */
  readonly paint: number;
  /** Box indexes of the grounds it sits on, outermost first. */
  readonly grounds: readonly number[];
  /** Its lines from its last layout event, when one was seen. */
  readonly lines?: readonly QaLine[] | undefined;
  /** Inside a screen presented in a surface of its own (a sheet). */
  readonly presented: boolean;
}

export interface TreeControl {
  readonly box: number;
  readonly label: string;
  readonly screen: string;
  readonly layer: number | null;
  readonly free: boolean;
  readonly paint: number;
  readonly grounds: readonly number[];
  /** It draws a ground of its own. */
  readonly ownGround: boolean;
}

export interface LayoutTree {
  /** Every native box a check measures, texts included. */
  readonly boxes: readonly FiberLike[];
  /** Readable names per box index, for clips and cards. */
  readonly labels: ReadonlyMap<number, string>;
  /** Drawing order per box index, for grounds. */
  readonly paints: ReadonlyMap<number, number>;
  readonly texts: readonly TreeText[];
  readonly controls: readonly TreeControl[];
}

/** The contexts that say which screen a subtree belongs to and whether it is focused. */
export interface ScreenContexts {
  /** Its value is the route: `{ name }`. */
  readonly route: unknown;
  /** Its value is false for a screen that is not focused. */
  readonly focused: unknown;
  /** A native text's lines from its last layout event. */
  readonly linesOf?: (fiber: FiberLike) => readonly QaLine[] | undefined;
}

interface Scope {
  readonly screen: string;
  readonly layer: number | null;
  readonly controls: readonly number[];
  readonly clip: number | null;
  readonly card: number | null;
  readonly free: boolean;
  readonly testId: string | null;
  readonly grounds: readonly number[];
  readonly presented: boolean;
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

/** The roundness of all four corners: a sheet's top band, rounded at its top only, is no card. */
function radiusOf(style: ViewStyle): number {
  const all = typeof style.borderRadius === 'number' ? style.borderRadius : 0;
  const corners = [
    style.borderTopLeftRadius,
    style.borderTopRightRadius,
    style.borderBottomLeftRadius,
    style.borderBottomRightRadius,
  ].map((value) => (typeof value === 'number' ? value : all));
  return Math.min(...corners);
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
  const paints = new Map<number, number>();
  let paint = 0;
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
    grounds: [],
    presented: false,
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
      const role = props.accessibilityRole ?? props.role;
      if (props.accessible === true && typeof role === 'string' && ART_ROLES.has(role)) continue;
      paint += 1;
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
            paint,
            grounds: inner.grounds,
            lines: contexts.linesOf?.(fiber),
            presented: inner.presented,
          });
        }
        // Nested spans are drawn by this text.
        continue;
      }
      const index = boxes.length;
      let used = false;
      const name = labelFor(testId, inner);
      const grounded = drawsGround(style.backgroundColor);
      if (SCROLL_TYPES.has(type)) {
        // What clips or holds the scroll view does not judge the content scrolling inside it.
        inner = { ...inner, layer: index, clip: null, card: null };
        used = true;
      }
      if (MAP_TYPES.test(type)) inner = { ...inner, free: true };
      if (SCREEN_TYPES.has(type)) {
        const presentation = props.stackPresentation;
        // A stack presented as a sheet keeps its screens (pushed inside it) on the sheet's surface.
        inner = {
          ...inner,
          presented:
            inner.presented || (typeof presentation === 'string' && OWN_SURFACE.has(presentation)),
        };
      }
      if (isControl(type, props)) {
        controls.push({
          box: index,
          label: name,
          screen: inner.screen,
          layer: inner.layer,
          free: inner.free,
          paint,
          grounds: inner.grounds,
          ownGround: grounded,
        });
        inner = { ...inner, controls: [...inner.controls, index] };
        used = true;
      }
      if (!SCROLL_TYPES.has(type)) {
        if (style.overflow === 'hidden') {
          inner = { ...inner, clip: index };
          used = true;
        }
        if (radiusOf(style) >= CARD_RADIUS && (grounded || GLASS_TYPES.test(type))) {
          inner = { ...inner, card: index };
          used = true;
        }
      }
      if (grounded) {
        inner = { ...inner, grounds: [...inner.grounds, index] };
        used = true;
      }
      if (used) {
        boxes.push(fiber);
        labels.set(index, name);
        paints.set(index, paint);
      }
    }
    if (testId !== null) inner = { ...inner, testId };
    if (fiber.child) stack.push([fiber.child, inner]);
  }
  return { boxes, labels, paints, texts, controls };
}
