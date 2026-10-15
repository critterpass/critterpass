/**
 * Painting days by hand, for every look: a tap paints one day in the tool (or clears it when it is
 * already that), and a held drag paints every open day between where it started and the finger,
 * all set or all cleared as its first day decided. A tap that lands right after a drag is the
 * drag's own release, not a second paint.
 */
import { useRef } from 'react';

import type { DragHandlers } from '../premium/calendar/day-grid';
import {
  datesBetween,
  paintMode,
  painted,
  type ManualMark,
  type ManualMarks,
  type PaintMode,
} from './manual-days';

const RELEASE_MS = 400;

export function useManualPaint(
  marks: ManualMarks,
  tool: ManualMark,
  open: (date: string) => boolean,
  onMarks: (next: ManualMarks) => void,
): { readonly paint: (date: string) => void; readonly onDrag: DragHandlers } {
  const stroke = useRef<{ origin: string; base: ManualMarks; mode: PaintMode } | null>(null);
  const lastStroke = useRef(0);
  return {
    paint: (date) => {
      if (Date.now() - lastStroke.current < RELEASE_MS) return;
      onMarks(painted(marks, [date], tool, paintMode(marks, date, tool)));
    },
    onDrag: {
      begin: (date) => {
        if (!open(date)) return;
        const mode = paintMode(marks, date, tool);
        stroke.current = { origin: date, base: marks, mode };
        onMarks(painted(marks, [date], tool, mode));
      },
      move: (date) => {
        const held = stroke.current;
        if (held === null) return;
        onMarks(painted(held.base, datesBetween(held.origin, date).filter(open), tool, held.mode));
      },
      end: () => {
        stroke.current = null;
        lastStroke.current = Date.now();
      },
    },
  };
}
