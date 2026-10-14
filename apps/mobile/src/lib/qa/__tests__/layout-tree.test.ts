import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { NavigationRouteContext } from 'expo-router/build/react-navigation/core/NavigationProvider';
import { IsFocusedContext } from 'expo-router/build/react-navigation/core/useIsFocused';

import type { QaRect } from '../header-overlap';
import {
  LAYOUT_SETTLE_MS,
  noteTextLayoutEvent,
  resetLayoutScan,
  scheduleLayoutScan,
} from '../layout-scan';
import { isLayoutSettled, subscribeLayoutSettled } from '../layout-settled';
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

  it('leaves artwork out, keeps grounds in drawing order, and takes a top-rounded band for no card', () => {
    const root = tree([
      screen('issued', true, [
        host('RCTView', { style: { ...card, overflow: 'visible' } }, at(17, 84, 377, 300), [
          words('GIVEN NAME', at(120, 100, 200, 20)),
          host('RCTView', { accessible: true, accessibilityRole: 'image' }, at(250, 300, 100, 60), [
            words('ISSUED', at(256, 317, 93, 52)),
          ]),
        ]),
        host(
          'RCTView',
          { style: { ...card, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 } },
          at(0, 296, 411, 120),
          [words('Jimbaran', at(20, 398, 371, 18))],
        ),
      ]),
    ]);
    const result = collectLayoutTree(root, contexts);
    expect(result.texts.map((t) => t.words)).toEqual(['GIVEN NAME', 'Jimbaran']);
    const [name, place] = result.texts;
    expect(name?.card).not.toBeNull();
    expect(place?.card).toBeNull();
    // Both sit on a ground; the band drawn after the pass covers what the pass drew.
    const passGround = name?.grounds.at(-1) ?? -1;
    const bandGround = place?.grounds.at(-1) ?? -1;
    expect(result.paints.get(bandGround) ?? 0).toBeGreaterThan(name?.paint ?? 0);
    expect(result.paints.get(passGround) ?? 0).toBeLessThan(name?.paint ?? 0);
  });

  it('marks texts in a screen presented as a sheet', () => {
    const root = tree([
      screen('guide', true, [
        host('RNSScreen', { stackPresentation: 'formSheet' }, at(0, 0, 402, 800), [
          words('Tokek', at(114, 25, 56, 16)),
        ]),
        host('RNSScreen', { stackPresentation: 'push' }, at(0, 0, 402, 874), [
          words('Crew made', at(172, 27, 67, 13)),
        ]),
      ]),
    ]);
    expect(collectLayoutTree(root, contexts).texts.map((t) => [t.words, t.presented])).toEqual([
      ['Tokek', true],
      ['Crew made', false],
    ]);
  });

  it('marks texts in a stack presented as a sheet, its screens pushed inside it', () => {
    const root = tree([
      screen('pitch', true, [
        host('RNSScreen', { stackPresentation: 'formSheet' }, at(0, 0, 402, 800), [
          host('RNSScreen', { stackPresentation: 'push' }, at(0, 0, 402, 800), [
            words('Pitch a place', at(152, 33, 99, 14)),
          ]),
        ]),
      ]),
    ]);
    expect(collectLayoutTree(root, contexts).texts.map((t) => [t.words, t.presented])).toEqual([
      ['Pitch a place', true],
    ]);
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
        words('Oct 23–29 · 1 going', at(26, 108, 140, 18), { testID: 'trip-hub-eyebrow' }),
        words('Day 1 · Old Quarter', at(36, 418, 200, 18)),
        words('Day 2 · Lakes and markets', at(36, 426, 160, 18)),
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
    expect(isLayoutSettled()).toBe(UI_QA_ENABLED);
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

  it('is busy from a navigation until the next measurement, and tells its listeners', () => {
    const root = tree([screen('index', true, [words('Home', at(20, 100, 80, 20))])]);
    const element = (
      root.child?.child?.child?.stateNode as { canonical: { publicInstance: unknown } }
    ).canonical.publicInstance;
    (globalThis as { event?: unknown }).event = { currentTarget: element };
    const flips: boolean[] = [];
    const stop = subscribeLayoutSettled(() => flips.push(isLayoutSettled()));
    noteTextLayoutEvent();
    jest.advanceTimersByTime(LAYOUT_SETTLE_MS + 1000);
    scheduleLayoutScan();
    expect(isLayoutSettled()).toBe(false);
    jest.advanceTimersByTime(LAYOUT_SETTLE_MS + 1000);
    stop();
    expect(flips).toEqual(UI_QA_ENABLED ? [true, false, true] : []);
  });

  it('stays settled while a text ticks in place, and a ticking text cannot hold a scan off', () => {
    const root = tree([screen('hub', true, [words('8D 10:20:38', at(20, 100, 120, 20))])]);
    const element = (
      root.child?.child?.child?.stateNode as { canonical: { publicInstance: unknown } }
    ).canonical.publicInstance;
    const lines = [{ x: 20, y: 100, width: 120, height: 20 }];
    const tick = () => {
      (globalThis as { event?: unknown }).event = {
        currentTarget: element,
        nativeEvent: { lines },
      };
      noteTextLayoutEvent();
    };
    tick();
    // A tick every 600 ms, faster than the quiet time a new layout waits for.
    for (let k = 0; k < 4; k += 1) {
      jest.advanceTimersByTime(600);
      tick();
    }
    jest.advanceTimersByTime(LAYOUT_SETTLE_MS + 1000);
    expect(isLayoutSettled()).toBe(UI_QA_ENABLED);
    tick();
    expect(isLayoutSettled()).toBe(UI_QA_ENABLED);
  });

  it('stays quiet without a layout event to start from', () => {
    noteTextLayoutEvent();
    jest.advanceTimersByTime(LAYOUT_SETTLE_MS * 4);
    expect(reports).toEqual([]);
  });
});
