/**
 * The showdown's two names: each on the render's line (KYOTO at 120 pt is 96 pt tall, with room
 * only for marks a name has), its room kept from the first frame, hidden until both halves are
 * measured, at the designed size when the halves fit the screen and at one shared smaller size when
 * they don't; a long word is set smaller until it fits whole.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('@/ui/sticker/Sticker', () => require('@/ui/avatar/test-support/sticker-double'));
// Loops are timing, not layout: the tests see their resting frame.
jest.mock('@/motion/use-loop', () => ({ useLoop: () => ({}) }));
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: jest.fn(() => ({})),
}));

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { FACE_METRICS } from '@/ui/text/glyph-room';

import { Final, OPT_KYOTO, seedFinal } from '../../test-support/final-fixtures';
import { MAYA, renderVote, seedCrew, until } from '../../test-support/vote-harness';
import { scalesAt, sharedNameLine, type HalfMeasure } from '../showdown-name-fit';
import {
  countLines,
  markRoom,
  setInDisplayFace,
  typeSize,
  widthFit,
  wordmarkBox,
} from '../wordmark-box';

const FACE = FACE_METRICS['Archivo'] ?? { ascent: 0, descent: 0, glyphTop: 0, capHeight: 0 };
/** The render's name: 120 pt on a 0.8 em line. */
const SIZE = 120;
const LEADING = 0.8;
/** Where the render's line puts the baseline, from the line's top. */
const BASELINE = ((LEADING - FACE.ascent - FACE.descent) / 2 + FACE.ascent) * SIZE;

/** A name's text as iOS lays it out on a line `leading` em tall: the room for marks, then lines. */
function iosText(leading: number, lines = 1) {
  const line = leading * SIZE;
  const tight = leading < FACE.ascent + FACE.descent;
  const baseline = tight
    ? leading - FACE.descent
    : (leading - FACE.ascent - FACE.descent) / 2 + FACE.ascent;
  const room = (FACE.glyphTop - baseline) * SIZE;
  return {
    layout: { size: SIZE, line, lines, height: room + line * lines },
    /** The first baseline, from the text's top. */
    firstBaseline: room + baseline * SIZE,
  };
}

let stack: TestLocalFirst | null = null;

async function open(): Promise<TestLocalFirst> {
  stack = await openTestLocalFirst({ holdUploads: true });
  await seedCrew(stack);
  return stack;
}

afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

describe('wordmark box', () => {
  it('keeps room only for the marks a name has', () => {
    expect(markRoom('KYOTO', LEADING)).toEqual({ top: 0, bottom: 0 });
    // Ẵ rises a full stack above the capitals; nothing hangs under the baseline.
    const daNang = markRoom('ĐÀ NẴNG', LEADING);
    expect(daNang.top * SIZE).toBeCloseTo(FACE.glyphTop * SIZE - BASELINE, 5);
    expect(daNang.bottom).toBe(0);
    // Ộ has a mark above and a dot below.
    const hoiAn = markRoom('HỘI AN', LEADING);
    expect(hoiAn.top).toBeGreaterThan(0);
    expect(hoiAn.bottom * SIZE).toBeCloseTo(FACE.descent * SIZE - (LEADING * SIZE - BASELINE), 5);
    expect(markRoom('QUITO', LEADING)).toMatchObject({ top: 0 });
    expect(markRoom('QUITO', LEADING).bottom).toBeGreaterThan(0);
  });

  it("sets a plain name on the render's line whatever leading the text was laid out with", () => {
    // English display leading (tighter than the face) and Vietnamese (looser) end in one box.
    for (const leading of [0.86, 1.12]) {
      const text = iosText(leading);
      const box = wordmarkBox(text.layout, LEADING, markRoom('KYOTO', LEADING));
      expect(box.height).toBeCloseTo(LEADING * SIZE, 5);
      // The first baseline sits where the render's line puts it.
      expect(text.firstBaseline - box.top).toBeCloseTo(BASELINE, 5);
    }
  });

  it('adds a line for each further line of a long name, and the room of a marked one', () => {
    const two = iosText(0.86, 2);
    expect(wordmarkBox(two.layout, LEADING, markRoom('SAN JOSE', LEADING)).height).toBeCloseTo(
      LEADING * SIZE + two.layout.line,
      5,
    );
    const marked = iosText(1.12);
    const room = markRoom('ĐÀ NẴNG', LEADING);
    const box = wordmarkBox(marked.layout, LEADING, room);
    expect(box.height).toBeCloseTo((LEADING + room.top) * SIZE, 5);
    // Its tallest mark is the top of the text, so the text starts where the box does.
    expect(box.top).toBeCloseTo(0, 5);
  });

  it('works from the display face only, at the size the platform measured', () => {
    expect(setInDisplayFace('ĐÀ NẴNG', 'vi')).toBe(true);
    expect(setInDisplayFace('KYOTO', 'en')).toBe(true);
    // Thai and Japanese set display type in another face, as does a name in another script.
    expect(setInDisplayFace('KYOTO', 'th')).toBe(false);
    expect(setInDisplayFace('京都', 'en')).toBe(false);
    expect(typeSize(FACE.capHeight * 132, SIZE)).toBeCloseTo(132, 5);
    expect(typeSize(undefined, SIZE)).toBe(SIZE);
    expect(typeSize(4, SIZE)).toBe(SIZE);
  });
});

describe('shared name size', () => {
  const half = (designLine: number, designHeight: number, rest: number): HalfMeasure => ({
    name: { designLine, designHeight },
    rest,
  });
  const totalAt = (halves: readonly [HalfMeasure, HalfMeasure], line: number | null) => {
    const scales = scalesAt(halves, line);
    return halves.reduce((sum, h, i) => {
      const scale = scales[i] ?? 1;
      return sum + h.rest + (h.name.heightAt?.(scale) ?? h.name.designHeight * scale);
    }, 0);
  };

  it('keeps the designed size when the halves fit, and shrinks both names equally when not', () => {
    // English: KYOTO at the render's 120 pt and a LISBON its half's width set at 105, 690 of 700
    // points in all. Nothing changes.
    const en = [half(120, 96, 290), half(105, 84, 220)] as const;
    expect(sharedNameLine(en, 700)).toBeNull();
    expect(scalesAt(en, null)).toEqual([1, 1]);
    // Vietnamese chips wrap taller: 790 of 700. Both names end at one type size, the largest
    // that fits.
    const vi = [half(120, 96, 340), half(105, 84, 270)] as const;
    const size = sharedNameLine(vi, 700);
    const [a, b] = scalesAt(vi, size);
    expect(120 * a).toBeCloseTo(105 * b, 3);
    expect(totalAt(vi, size)).toBeLessThanOrEqual(700);
    expect(totalAt(vi, (size ?? 0) + 2)).toBeGreaterThan(700);
    // A marked name is taller than a plain one at the same size (it keeps its mark room): the two
    // still share one size.
    const marked = [half(120, 96, 340), half(120, 152, 270)] as const;
    const [plain, withMarks] = scalesAt(marked, sharedNameLine(marked, 700));
    expect(plain).toBeLessThan(1);
    expect(plain).toBeCloseTo(withMarks, 5);
  });

  it('lets a name of several words take fewer lines as it is set smaller', () => {
    // THÀNH PHỐ HỒ CHÍ MINH at the designed size: five words, a space 20 wide, a half 350 wide.
    const words = [270, 190, 150, 170, 260];
    expect(countLines(words, 20, 350)).toBe(4);
    // At half the size each line has twice the room, and at a third the name is on one line.
    expect(countLines(words, 20, 700)).toBe(2);
    expect(countLines(words, 20, 1200)).toBe(1);
    // A word that fits with less than the margin to spare goes to the next line, as the
    // platform may put it there.
    expect(countLines([200, 129], 20, 350)).toBe(2);
    expect(countLines([200, 120], 20, 350)).toBe(1);
    // The shared size uses those heights, not a straight scaling of the four-line box: the long
    // name can be larger than four scaled lines would allow.
    const heightAt = (scale: number) =>
      ((countLines(words, 20, 350 / scale) - 1) * 134 + 135) * scale;
    const long: HalfMeasure = { name: { designLine: 120, designHeight: 537, heightAt }, rest: 300 };
    const straight: HalfMeasure = { name: { designLine: 120, designHeight: 537 }, rest: 300 };
    const other = half(120, 96, 300);
    const closer = sharedNameLine([other, long], 800) ?? 0;
    const scaled = sharedNameLine([other, straight], 800) ?? 0;
    expect(closer).toBeGreaterThan(scaled);
    expect(totalAt([other, long], closer)).toBeLessThanOrEqual(800);
  });

  it('stops at the 44-point floor when nothing fits, and waits for both halves', () => {
    const crowded = [half(120, 96, 900), half(105, 84, 900)] as const;
    expect(sharedNameLine(crowded, 700)).toBe(44);
    // A half not measured yet: nothing is decided.
    expect(sharedNameLine([half(120, 96, 340), half(0, 0, 0)], 700)).toBeNull();
  });
});

describe('showdown names', () => {
  const layout = (width: number, height: number, y = 0) => ({
    nativeEvent: { layout: { x: 0, y, width, height } },
  });
  const style = (testID: string) =>
    StyleSheet.flatten(screen.getByTestId(testID).props.style as StyleProp<ViewStyle>);
  const scaleOf = (index: number) => {
    const transform = style(`showdown-name-${index}-set`)?.transform;
    const first = Array.isArray(transform) ? (transform[0] as { scale?: number }) : undefined;
    return first?.scale;
  };
  const TEXT = iosText(0.86).layout;
  /** A name's half is 350 points wide; its one word is `word` wide at the designed size. */
  const measureName = async (index: number, word: number) => {
    await fireEvent(screen.getByTestId(`showdown-name-${index}-box`), 'layout', layout(350, 0));
    const measurer = screen.getByTestId(`showdown-name-${index}-word-0`, {
      includeHiddenElements: true,
    });
    await fireEvent(measurer, 'textLayout', {
      nativeEvent: {
        lines: [{ width: word, height: TEXT.line, capHeight: FACE.capHeight * SIZE, text: 'X' }],
      },
    });
    // The name itself, laid out on one line in the box it is given.
    const width = Number(style(`showdown-name-${index}-set`)?.width);
    const name = screen.getByTestId(`showdown-name-${index}`);
    await fireEvent(name, 'textLayout', {
      nativeEvent: { lines: [{ width: word, height: TEXT.line, text: 'X' }] },
    });
    await fireEvent(name, 'layout', layout(width, TEXT.height));
  };

  async function showdown() {
    const s = await open();
    await seedFinal(s, [{ userId: MAYA, optionId: OPT_KYOTO }]);
    await renderVote(<Final me={s.uid} view="showdown" />, s);
    await until(() => screen.queryByText('LISBON') !== null);
  }

  it('keeps each name its room, shows them once measured and shrinks both only on overflow', async () => {
    await showdown();
    // Before anything is measured the names are hidden, in the room the render's line takes.
    expect(style('showdown-name-0-box')?.height).toBeCloseTo(LEADING * SIZE, 5);
    expect(style('showdown-name-0-set')?.opacity).toBe(0);
    await fireEvent(screen.getByTestId('showdown-body'), 'layout', layout(360, 700));
    await measureName(0, 250);
    await measureName(1, 310);
    // Only the names are measured so far: still hidden, still in their room.
    expect(style('showdown-name-0-set')?.opacity).toBe(0);
    // Both halves fit the screen: both names show at the designed size, on the render's line.
    await fireEvent(screen.getByTestId('showdown-pitch-0'), 'layout', layout(350, 150));
    await fireEvent(screen.getByTestId('showdown-pitch-1'), 'layout', layout(350, 100));
    await until(() => style('showdown-name-0-set')?.opacity !== 0);
    expect(scaleOf(0)).toBe(1);
    expect(scaleOf(1)).toBe(1);
    expect(style('showdown-name-1-set')?.opacity).not.toBe(0);
    expect(style('showdown-name-0-box')?.height).toBeCloseTo(LEADING * SIZE, 5);
    // The lower half's chips arrive and wrap taller: both names are set smaller, at one size,
    // without being hidden again.
    await fireEvent(screen.getByTestId('showdown-pitch-1'), 'layout', layout(350, 220));
    await until(() => (scaleOf(0) ?? 1) < 1 && (scaleOf(1) ?? 1) < 1);
    expect(scaleOf(0)).toBeCloseTo(scaleOf(1) ?? 0, 5);
    expect(style('showdown-name-0-set')?.opacity).not.toBe(0);
    expect(Number(style('showdown-name-0-box')?.height)).toBeLessThan(LEADING * SIZE);
    // Each name is laid out in a box widened by what it is scaled down by, so it breaks as the
    // smaller type would.
    expect(Number(style('showdown-name-0-set')?.width) * (scaleOf(0) ?? 0)).toBeCloseTo(350, 3);
  });

  it('sets a long name smaller until its longest word fits whole, and no smaller', async () => {
    await showdown();
    // The word is 520 points wide at its designed size, in a half 350 wide.
    await measureName(0, 520);
    const set = style('showdown-name-0-set');
    const scale = scaleOf(0) ?? 0;
    // The box it is laid out in holds the word, and the scaled box is the half's width.
    expect(Number(set?.width)).toBeGreaterThanOrEqual(520);
    expect(Number(set?.width) * scale).toBeCloseTo(350, 3);
    expect(scale).toBeGreaterThan(0.66);
    // A name that fits is never enlarged past its designed size.
    expect(widthFit(350, 250)).toBe(1);
    expect(widthFit(350, 520) * 520).toBeLessThanOrEqual(350);
  });
});
