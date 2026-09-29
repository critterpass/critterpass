import { describe, expect, it } from '@jest/globals';

import { orderLines } from '../src/order-lines';
import type { OcrBox, RawOcrLine } from '../src/types';

const line = (text: string, bbox: OcrBox, conf = 0.9): RawOcrLine => ({ text, bbox, conf });

/**
 * A receipt row printed flat and photographed rotated by `degrees` about the page centre, as the
 * recogniser's axis-aligned box of the rotated text (item on the left, price on the right).
 */
function rotated(text: string, x: number, y: number, w: number, h: number, degrees: number) {
  const angle = (degrees * Math.PI) / 180;
  const corners = [
    [x, y],
    [x + w, y],
    [x, y + h],
    [x + w, y + h],
  ].map(([px = 0, py = 0]) => {
    const dx = px - 0.5;
    const dy = py - 0.5;
    return [
      0.5 + dx * Math.cos(angle) - dy * Math.sin(angle),
      0.5 + dx * Math.sin(angle) + dy * Math.cos(angle),
    ];
  });
  const xs = corners.map(([cx = 0]) => cx);
  const ys = corners.map(([, cy = 0]) => cy);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return line(text, [left, top, Math.max(...xs) - left, Math.max(...ys) - top]);
}

describe('orderLines', () => {
  it('returns nothing for no lines', () => {
    expect(orderLines([])).toEqual([]);
  });

  it('numbers lines top to bottom from l0', () => {
    const ordered = orderLines([
      line('TOTAL 12.00', [0.1, 0.8, 0.5, 0.03]),
      line('WARUNG MAKAN', [0.2, 0.05, 0.6, 0.04]),
      line('Nasi goreng 5.00', [0.1, 0.3, 0.7, 0.03]),
    ]);
    expect(ordered.map((l) => [l.id, l.text])).toEqual([
      ['l0', 'WARUNG MAKAN'],
      ['l1', 'Nasi goreng 5.00'],
      ['l2', 'TOTAL 12.00'],
    ]);
  });

  it('reads an item and its price on the same row left to right', () => {
    const ordered = orderLines([
      line('5.00', [0.78, 0.301, 0.12, 0.03]),
      line('Es teh', [0.1, 0.35, 0.3, 0.03]),
      line('Nasi goreng', [0.1, 0.3, 0.4, 0.03]),
      line('2.00', [0.8, 0.349, 0.1, 0.03]),
    ]);
    expect(ordered.map((l) => l.text)).toEqual(['Nasi goreng', '5.00', 'Es teh', '2.00']);
    expect(ordered.map((l) => l.id)).toEqual(['l0', 'l1', 'l2', 'l3']);
  });

  it('keeps rows together on a slightly tilted photo', () => {
    const rows = [0.2, 0.26, 0.32, 0.38, 0.44];
    const raw = rows.flatMap((y, i) => [
      rotated(`item ${i}`, 0.08, y, 0.4, 0.03, 1.5),
      rotated(`${i}.00`, 0.75, y, 0.15, 0.03, 1.5),
    ]);
    const shuffled = [...raw.filter((_, i) => i % 2 === 1), ...raw.filter((_, i) => i % 2 === 0)];
    expect(orderLines(shuffled).map((l) => l.text)).toEqual(
      rows.flatMap((_, i) => [`item ${i}`, `${i}.00`]),
    );
    const tiltedTheOtherWay = rows.flatMap((y, i) => [
      rotated(`${i}.00`, 0.75, y, 0.15, 0.03, -1.5),
      rotated(`item ${i}`, 0.08, y, 0.4, 0.03, -1.5),
    ]);
    expect(orderLines(tiltedTheOtherWay).map((l) => l.text)).toEqual(
      rows.flatMap((_, i) => [`item ${i}`, `${i}.00`]),
    );
  });

  it('does not pull the lines beside a tall logo into one row', () => {
    const ordered = orderLines([
      line('LOGO', [0.05, 0.05, 0.2, 0.12]),
      line('Shop street 1', [0.3, 0.05, 0.5, 0.03]),
      line('Hanoi', [0.3, 0.1, 0.3, 0.03]),
    ]);
    expect(ordered.map((l) => l.text)).toEqual(['Shop street 1', 'LOGO', 'Hanoi']);
  });

  it('gives the same ids whatever order the recogniser reported', () => {
    const raw = [
      line('A', [0.1, 0.1, 0.2, 0.03]),
      line('B', [0.6, 0.1, 0.2, 0.03]),
      line('C', [0.1, 0.2, 0.2, 0.03]),
    ];
    const forwards = orderLines(raw);
    expect(orderLines([...raw].reverse())).toEqual(forwards);
  });

  it('drops blank lines, trims text and clamps boxes and confidence', () => {
    const ordered = orderLines([
      line('   ', [0.1, 0.1, 0.2, 0.03]),
      line('  Phở bò 65.000  ', [-0.02, 0.5, 1.2, 0.0312345], 1.4),
      line('Total', [0.1, 0.9, 0.3, 0.2], Number.NaN),
    ]);
    expect(ordered).toEqual([
      { id: 'l0', text: 'Phở bò 65.000', bbox: [0, 0.5, 1, 0.0312], conf: 1 },
      { id: 'l1', text: 'Total', bbox: [0.1, 0.9, 0.3, 0.1], conf: 0 },
    ]);
  });
});
