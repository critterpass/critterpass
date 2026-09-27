// Skia's native renderer does not exist under Jest; see test-support/skia-double for the stand-in.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('../test-support/skia-double'));
jest.mock('expo-router', () => ({ useIsFocused: () => true }));
// The sticker's pixels come from native Skia, which Jest lacks; its own suite renders them with
// CanvasKit. Here it keeps the same accessible element (size, role, label) so the audit sees what
// VoiceOver sees around every sticker.
jest.mock('../sticker/Sticker', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories cannot close over module-scope imports
  const RN = require('react-native') as typeof ReactNativeModule;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories cannot close over module-scope imports
  const labels = require('@/lib/a11y/labels') as typeof LabelsModule;
  return {
    Sticker: ({ size, name, pose, onPress }: StickerStandInProps) => (
      <RN.View
        style={{ width: size, height: size }}
        accessible
        accessibilityRole={onPress ? 'button' : 'image'}
        accessibilityLabel={
          pose ? labels.guideLabel(name, pose) : labels.critterLabel(name, 'common')
        }
        onTouchEnd={onPress}
      />
    ),
  };
});

import { readdirSync } from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import * as reanimated from 'react-native-reanimated';

import type * as ReactNativeModule from 'react-native';

import { contrastRatio, parseColor, tokens } from '@cp/design-tokens';

import type * as LabelsModule from '@/lib/a11y/labels';
import { ThemeProvider } from '@/lib/theme';
import { ScreenJoltProvider } from '@/motion/patterns/thud';

import { allFixtures } from '../gallery/registry';
import type { Fixture } from '../gallery/types';
import { renderUi } from '../test-support/render';
import { Text as UiText } from '../text/Text';
import { MIN_TOUCH_TARGET } from '../theme';

/**
 * Accessibility audit over every dev-gallery fixture (docs/design-system.md §5): each state renders
 * at the default and the AX3 font scale and under Reduce Motion, and every interactive element has
 * a role, a spoken label and a 44 pt target, primary actions wrap instead of truncating, and text
 * meets WCAG contrast against the surface it sits on.
 */

interface StickerStandInProps {
  readonly size: number;
  readonly name: string;
  readonly pose?: string;
  readonly onPress?: () => void;
}

const UI_DIR = path.resolve(__dirname, '..');

function fixtureFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : fixtureFiles(full);
    return entry.name.endsWith('.fixtures.tsx') ? [full] : [];
  });
}

const FILES = fixtureFiles(UI_DIR);
FILES.forEach((file) => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the audit loads every fixture file on disk, the way the gallery's require.context does in Metro
  require(file);
});
const FIXTURES = allFixtures();

/**
 * Display and h1 text auto-fits to its line limit instead of wrapping (docs/design-system.md §5
 * Dynamic Type), so a single-line display title is shrunk, never cut off.
 */
const DISPLAY_FONT_SIZE = 28; // before Dynamic Type scaling

const CONTENT_ROLES = new Set(['text', 'image', 'header', 'summary']);

const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'checkbox',
  'radio',
  'switch',
  'tab',
  'togglebutton',
  'adjustable',
  'menuitem',
  'combobox',
  'search',
  'slider',
  'spinbutton',
]);

/** A host element as `toJSON()` returns it. */
interface Node {
  readonly type: string;
  readonly props: Readonly<Record<string, unknown>>;
  readonly children: readonly (Node | string)[] | null;
}
type Style = Record<string, unknown>;

interface Issue {
  readonly check: string;
  readonly detail: string;
}

function styleOf(node: Node): Style {
  return (StyleSheet.flatten(node.props.style as never) as Style | undefined) ?? {};
}

function isHidden(node: Node): boolean {
  const { props } = node;
  return (
    props.accessibilityElementsHidden === true ||
    props.importantForAccessibility === 'no-hide-descendants' ||
    props['aria-hidden'] === true
  );
}

function childNodes(node: Node): Node[] {
  return (node.children ?? []).filter((child): child is Node => typeof child !== 'string');
}

function textContent(node: Node): string {
  return (node.children ?? [])
    .map((child) => (typeof child === 'string' ? child : isHidden(child) ? '' : textContent(child)))
    .join('')
    .trim();
}

function visibleTexts(node: Node): Node[] {
  if (isHidden(node)) return [];
  if (node.type === 'Text') return textContent(node) ? [node] : [];
  return childNodes(node).flatMap(visibleTexts);
}

function roleOf(node: Node): string | undefined {
  const role = (node.props.accessibilityRole ?? node.props.role) as string | undefined;
  return role && role !== 'none' ? role : undefined;
}

function isInteractive(node: Node): boolean {
  if (node.props.accessible === false) return false;
  const role = roleOf(node);
  if (role && INTERACTIVE_ROLES.has(role)) return true;
  if (node.type === 'TextInput' || node.type === 'RCTSinglelineTextInputView') return true;
  const actions = node.props.accessibilityActions as readonly unknown[] | undefined;
  return (
    node.props.accessible === true &&
    (typeof node.props.onClick === 'function' ||
      typeof node.props.onResponderRelease === 'function' ||
      (actions?.length ?? 0) > 0)
  );
}

function labelOf(node: Node): string {
  const label = (node.props.accessibilityLabel ?? node.props['aria-label']) as string | undefined;
  return (
    (label ?? '').trim() ||
    textContent(node) ||
    ((node.props.placeholder as string | undefined) ?? '').trim()
  );
}

function slop(node: Node): { top: number; bottom: number; left: number; right: number } {
  const value = node.props.hitSlop as number | Record<string, number> | undefined;
  if (typeof value === 'number') return { top: value, bottom: value, left: value, right: value };
  return {
    top: value?.top ?? 0,
    bottom: value?.bottom ?? 0,
    left: value?.left ?? 0,
    right: value?.right ?? 0,
  };
}

function num(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

/**
 * The height a node is guaranteed at least: its explicit height or min-height, else its vertical
 * padding plus its tallest descendant (text contributes its line height). A lower bound, so a
 * control only fails when even its largest child cannot make it 44 pt tall.
 */
function minimumHeight(node: Node): number {
  const style = styleOf(node);
  const explicit = Math.max(num(style.height), num(style.minHeight));
  const padding =
    (num(style.paddingTop) || num(style.paddingVertical) || num(style.padding)) +
    (num(style.paddingBottom) || num(style.paddingVertical) || num(style.padding));
  const own = node.type === 'Text' ? num(style.lineHeight) || num(style.fontSize) * 1.2 : 0;
  const children = childNodes(node).map(minimumHeight);
  return Math.max(explicit, own, padding + Math.max(0, ...children));
}

/** Height and width a control is guaranteed at least, from explicit sizes, padding and content. */
function minimumTarget(node: Node, parentHeight: number): { height: number; width: number } {
  const style = styleOf(node);
  const s = slop(node);
  // An absolute-fill control (the invisible input over code boxes) is as tall as its parent.
  const own = isFullBleed(node) ? Math.max(parentHeight, minimumHeight(node)) : minimumHeight(node);
  const height = own + s.top + s.bottom;
  // A control without a fixed width stretches or grows with its label; only fixed widths can fail.
  const width =
    typeof style.width === 'number'
      ? Math.max(style.width, num(style.minWidth)) + s.left + s.right
      : Number.POSITIVE_INFINITY;
  return { height, width };
}

function isLargeText(style: Style): boolean {
  const size = typeof style.fontSize === 'number' ? style.fontSize : 0;
  const bold =
    /^(bold|[6-9]00)$/.test(String((style.fontWeight as string | number | undefined) ?? '')) ||
    /Bold|Black|Heavy/.test(String((style.fontFamily as string | undefined) ?? ''));
  return size >= 24 || (bold && size >= 18.66);
}

function opaque(color: unknown): color is string {
  if (typeof color !== 'string' || color === 'transparent') return false;
  const hex = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color);
  const rgb = /^rgb\(/.test(color);
  const rgba = /^rgba\(.*,\s*1(?:\.0+)?\s*\)$/.test(color);
  return hex || rgb || rgba;
}

const PAINTED_LAYERS = new Set([
  'Image',
  'RNSVGSvgView',
  'SkiaView',
  'SkiaPictureView',
  'Canvas',
  'ViewManagerAdapter_ExpoLinearGradient',
]);

function isFullBleed(node: Node): boolean {
  const style = styleOf(node);
  return ['top', 'bottom', 'left', 'right'].every((edge) => style[edge] === 0) || style.inset === 0;
}

function audit(root: Node | Node[] | null, scale: number): Issue[] {
  const issues: Issue[] = [];
  const visit = (node: Node, background: string | null, parentHeight: number) => {
    if (isHidden(node)) return;
    const style = styleOf(node);
    let surface = opaque(style.backgroundColor) ? style.backgroundColor : background;

    if (isInteractive(node)) {
      const name = (node.props.testID as string | undefined) ?? node.type;
      if (!roleOf(node) && node.type !== 'TextInput') {
        issues.push({
          check: 'role',
          detail: `${name} "${labelOf(node)}" has no accessibilityRole`,
        });
      }
      if (!labelOf(node)) issues.push({ check: 'label', detail: `${name} has no spoken label` });
      const target = minimumTarget(node, parentHeight);
      // Content with custom actions (a chat bubble, a timeline label) is not a touch control.
      const isControl = !CONTENT_ROLES.has(roleOf(node) ?? '');
      if (isControl && (target.height < MIN_TOUCH_TARGET || target.width < MIN_TOUCH_TARGET)) {
        issues.push({
          check: 'target',
          detail: `${name} "${labelOf(node)}" is ${String(target.height)}x${String(target.width)}`,
        });
      }
      if (roleOf(node) === 'button' && scale > 1) {
        // An action button whose one visible text is its label must wrap, never truncate; cards
        // that are pressable as a whole may clip a secondary line (their label carries it all).
        const texts = visibleTexts(node);
        const only = texts.length === 1 ? texts[0] : undefined;
        if (
          only?.props.numberOfLines === 1 &&
          num(styleOf(only).fontSize) / scale < DISPLAY_FONT_SIZE &&
          textContent(only).toLowerCase() === labelOf(node).toLowerCase()
        ) {
          issues.push({ check: 'wrap', detail: `${name} "${labelOf(node)}" truncates at AX3` });
        }
      }
    }

    if (node.type === 'Text' && surface && opaque(style.color) && textContent(node)) {
      const ratio = contrastRatio(style.color, surface);
      const needed = isLargeText(style) ? 3 : 4.5;
      if (ratio < needed) {
        issues.push({
          check: 'contrast',
          detail: `"${textContent(node).slice(0, 24)}" ${style.color} on ${surface} is ${ratio.toFixed(2)}:1`,
        });
      }
    }

    childNodes(node).forEach((child, index) => {
      // An overlay (caption over a photo) sits on whatever its earlier siblings drew.
      const overlay = styleOf(child).position === 'absolute' && index > 0;
      visit(child, overlay ? null : surface, minimumHeight(node));
      // A layer painted behind later siblings (an absolute fill, image, gradient or Skia canvas)
      // replaces the surface they sit on: a solid full-bleed fill is known, anything else is not.
      if (styleOf(child).position === 'absolute' || PAINTED_LAYERS.has(String(child.type))) {
        const fill = styleOf(child).backgroundColor;
        surface = isFullBleed(child) && opaque(fill) ? fill : null;
      }
    });
  };
  const roots = Array.isArray(root) ? root : root ? [root] : [];
  roots.forEach((node) => visit(node, tokens.semantic.bg.base, 0));
  return issues;
}

async function auditFixture(fixture: Fixture, scale: number): Promise<Issue[]> {
  const result = await renderUi(
    <ThemeProvider fontScale={scale}>
      <ScreenJoltProvider>{fixture.render()}</ScreenJoltProvider>
    </ThemeProvider>,
  );
  const issues = audit(result.toJSON(), scale);
  await result.unmount();
  return issues;
}

const cases = FIXTURES.map(
  (fixture) => [`${fixture.component} / ${fixture.state}`, fixture] as const,
);

describe('accessibility audit of every gallery fixture', () => {
  it('finds the fixture files the gallery loads', () => {
    expect(FILES.length).toBeGreaterThan(20);
    expect(FIXTURES.length).toBeGreaterThan(100);
    parseColor(tokens.semantic.bg.base);
  });

  it('flags a nameless, roleless, undersized control and low-contrast text', async () => {
    const bad: Fixture = {
      component: 'Broken',
      state: 'every mistake',
      render: () => (
        <View style={{ backgroundColor: tokens.color.paper.base }}>
          <Pressable testID="tiny" onPress={() => undefined} style={{ height: 20, width: 20 }} />
          <UiText variant="body" color={tokens.color.yellow}>
            faint
          </UiText>
        </View>
      ),
    };
    const checks = (await auditFixture(bad, 1)).map((issue) => issue.check);
    expect(checks).toEqual(expect.arrayContaining(['role', 'label', 'target', 'contrast']));
  });

  it('flags an action label that truncates at AX3', async () => {
    const bad: Fixture = {
      component: 'Broken',
      state: 'clipped action',
      render: () => (
        <Pressable accessibilityRole="button" onPress={() => undefined} style={{ minHeight: 48 }}>
          <UiText variant="buttonSm" numberOfLines={1}>
            Board now
          </UiText>
        </Pressable>
      ),
    };
    expect((await auditFixture(bad, 2)).map((issue) => issue.check)).toEqual(['wrap']);
    expect(await auditFixture(bad, 1)).toEqual([]);
  });

  describe.each([1, 2])('at font scale %d', (scale) => {
    it.each(cases)('%s', async (_name, fixture) => {
      expect(await auditFixture(fixture, scale)).toEqual([]);
    });
  });

  describe('under Reduce Motion', () => {
    beforeAll(() => {
      jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
      jest.spyOn(reanimated, 'useReducedMotion').mockReturnValue(true);
    });
    afterAll(() => {
      jest.restoreAllMocks();
    });

    it.each(cases)('%s', async (_name, fixture) => {
      expect(await auditFixture(fixture, 1)).toEqual([]);
    });
  });
});
