import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { NavigationRouteContext } from 'expo-router/build/react-navigation/core/NavigationProvider';
import { IsFocusedContext } from 'expo-router/build/react-navigation/core/useIsFocused';

import type { QaRect } from '../header-overlap';
import { LAYOUT_SETTLE_MS, noteTextLayoutEvent, resetLayoutScan } from '../layout-scan';
import { collectLayoutTree, drawsGround, subjectWords } from '../layout-tree';
import { setUiQaSink, UI_QA_ENABLED } from '../ui-qa';

/** A committed tree as React keeps it: work tags, props, child, sibling and return links. */
interface Spec {
  readonly tag: number;
  readonly type?: unknown;
  readonly props?: unknown;
  readonly rect?: QaRect;
  readonly scrollTop?: number;
  readonly children?: readonly Spec[];
}

interface MutableFiber {
  tag: number;
  type: unknown;
  memoizedProps: unknown;
  stateNode: unknown;
  child: MutableFiber | null;
  sibling: MutableFiber | null;
  return: MutableFiber | null;
}

const at = (x: number, y: number, width: number, height: number): QaRect => ({
  x,
  y,
  width,
  height,
});
const host = (type: string, props: object, rect: QaRect, children: Spec[] = []): Spec => ({
  tag: 5,
  type,
  props,
  rect,
  children,
});
const words = (value: string, rect: QaRect, props: object = {}): Spec =>
  host('RCTText', props, rect, [{ tag: 6, props: value }]);
const provider = (context: unknown, value: unknown, children: Spec[]): Spec => ({
  tag: 10,
  type: context,
  props: { value, children: null },
  children,
});
const screen = (name: string, focused: boolean, children: Spec[]): Spec =>
  provider(NavigationRouteContext, { key: `${name}-1`, name }, [
    provider(IsFocusedContext, focused, children),
  ]);

function build(spec: Spec, parent: MutableFiber | null): MutableFiber {
  const fiber: MutableFiber = {
    tag: spec.tag,
    type: spec.type ?? null,
    memoizedProps: spec.props ?? null,
    stateNode: null,
    child: null,
    sibling: null,
    return: parent,
  };
  if (spec.rect) {
    const rect = spec.rect;
    const element = {
      __internalInstanceHandle: fiber,
      scrollTop: spec.scrollTop ?? 0,
      scrollLeft: 0,
      measureInWindow: (done: (x: number, y: number, w: number, h: number) => void) =>
        done(rect.x, rect.y, rect.width, rect.height),
    };
    fiber.stateNode = { node: {}, canonical: { publicInstance: element } };
  }
  let previous: MutableFiber | null = null;
  for (const child of spec.children ?? []) {
    const built = build(child, fiber);
    if (previous) previous.sibling = built;
    else fiber.child = built;
    previous = built;
  }
  return fiber;
}

function tree(children: Spec[]): MutableFiber {
  const root = build({ tag: 3, children }, null);
  root.stateNode = { current: root };
  return root;
}

/* eslint-disable critterpass/no-literal-style -- grounds as a style carries them: the parser's inputs */
const contexts = { route: NavigationRouteContext, focused: IsFocusedContext };
const card = { backgroundColor: '#ffffff', borderRadius: 24, overflow: 'hidden' as const };

const DRAWN = ['#fff', '#ffffffff', 'rgba(0,0,0,0.6)', 'white'];
const UNDRAWN = ['transparent', '#ffffff00', 'rgba(0, 0, 0, 0.1)', undefined];
/* eslint-enable critterpass/no-literal-style */

describe('layout tree', () => {
  it('reads texts, controls, clips and cards of focused screens only', () => {
    const root = tree([
      screen('home', false, [words('Where next?', at(20, 170, 200, 30))]),
      screen('pitch', true, [
        host('RCTView', { testID: 'pitch-card', style: card }, at(42, 264, 330, 418), [
          words('Chang pitches', at(130, 264, 120, 16)),
          host(
            'RCTView',
            { accessibilityRole: 'button', testID: 'pitch-add' },
            at(300, 270, 60, 30),
            [words('Add', at(310, 275, 40, 20))],
          ),
        ]),
        host('RCTView', { style: { opacity: 0 } }, at(0, 0, 10, 10), [
          words('measuring copy', at(0, 0, 10, 10)),
        ]),
      ]),
    ]);
    const result = collectLayoutTree(root, contexts);
    expect(result.texts.map((t) => [t.words, t.screen, t.label])).toEqual([
      ['Chang pitches', 'pitch', 'pitch-card "Chang pitches"'],
      ['Add', 'pitch', 'pitch-add "Add"'],
    ]);
    const [eyebrow, add] = result.texts;
    expect(eyebrow?.card).toBe(eyebrow?.clip);
    expect(result.labels.get(eyebrow?.clip ?? -1)).toBe('pitch-card');
    expect(result.controls.map((c) => c.label)).toEqual(['pitch-add']);
    expect(add?.controls).toEqual([result.controls[0]?.box]);
  });

  it('starts a layer at a scroll view: what holds it does not judge its content', () => {
    const root = tree([
      screen('plan', true, [
        host('RCTView', { style: card }, at(0, 300, 393, 552), [
          host('RCTScrollView', {}, at(0, 360, 393, 492), [words('8:00am', at(20, 400, 60, 20))]),
        ]),
      ]),
    ]);
    const [time] = collectLayoutTree(root, contexts).texts;
    expect(time).toMatchObject({ clip: null, card: null });
    expect(time?.layer).not.toBeNull();
  });

  it('marks map labels free and names texts with ticking digits once', () => {
    const root = tree([
      screen('plan', true, [
        host('RNMBXMapView', {}, at(0, 0, 393, 400), [words('1', at(180, 140, 12, 14))]),
      ]),
    ]);
    expect(collectLayoutTree(root, contexts).texts[0]?.free).toBe(true);
    expect(subjectWords('8D 14:28:09')).toBe('#D ##:##:##');
  });

  it('tells a ground that draws from one that does not', () => {
    expect(DRAWN.map(drawsGround)).toEqual([true, true, true, true]);
    expect(UNDRAWN.map(drawsGround)).toEqual([false, false, false, false]);
  });
});

describe('layout scan', () => {
  let reports: string[] = [];
  beforeEach(() => {
    jest.useFakeTimers();
    reports = [];
    setUiQaSink((line) => reports.push(line));
  });
  afterEach(() => {
    resetLayoutScan();
    setUiQaSink(null);
    delete (globalThis as { event?: unknown }).event;
    jest.useRealTimers();
  });

  it('finds the root from the text layout event and reports what the settled screen shows', () => {
    const root = tree([
      screen('[tripId]/index', true, [
        host('RCTView', { testID: 'glass-back', onClick: () => undefined }, at(20, 68, 48, 48)),
        words('Oct 23–29 · 1 going', at(26, 112, 140, 18), { testID: 'trip-hub-eyebrow' }),
        words('Day 1 · Old Quarter', at(36, 418, 200, 18)),
        words('Day 2 · Lakes and markets', at(36, 432, 160, 18)),
      ]),
    ]);
    const element = (
      root.child?.child?.child?.sibling?.stateNode as {
        canonical: { publicInstance: unknown };
      }
    ).canonical.publicInstance;
    (globalThis as { event?: unknown }).event = { currentTarget: element };
    noteTextLayoutEvent();
    jest.advanceTimersByTime(LAYOUT_SETTLE_MS + 1000);
    expect(reports).toEqual(
      UI_QA_ENABLED
        ? [
            expect.stringContaining(
              '[ui-qa] TEXT_OVER_CONTROL "[tripId]/index: trip-hub-eyebrow under glass-back"',
            ),
            expect.stringContaining(
              '[ui-qa] TEXT_OVERLAP "[tripId]/index: \\"Day # · Old Quarter\\" overlaps \\"Day # · Lakes and markets\\""',
            ),
          ]
        : [],
    );
  });

  it('stays quiet without a layout event to start from', () => {
    noteTextLayoutEvent();
    jest.advanceTimersByTime(LAYOUT_SETTLE_MS * 4);
    expect(reports).toEqual([]);
  });
});
