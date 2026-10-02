import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Dimensions } from 'react-native';

import { reportUiQa, UI_QA_ENABLED } from './ui-qa';

/* eslint-disable lingui/no-unlocalized-strings -- report subjects, never shown to a user */

/** A mounted native view: any host component's instance. */
export interface QaMeasurable {
  measureInWindow(done: (x: number, y: number, width: number, height: number) => void): void;
}

/** A laid-out control in window coordinates. */
export interface QaRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Anti-aliasing and rounding: two edges this close still only touch. */
const TOUCH_PT = 1;
/** Measure once the header's layout (and its fit-to-width text) has settled. */
const SETTLE_MS = 400;
/**
 * A push slides the whole screen in with a transform, which fires no layout pass: the row is
 * measured again until two samples agree, and a row still moving after this many is not judged.
 */
const MAX_SAMPLES = 10;

function sameRects(a: ReadonlyMap<string, QaRect>, b: ReadonlyMap<string, QaRect>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, rect] of a) {
    const other = b.get(id);
    if (
      !other ||
      Math.abs(rect.x - other.x) > TOUCH_PT ||
      Math.abs(rect.y - other.y) > TOUCH_PT ||
      Math.abs(rect.width - other.width) > TOUCH_PT ||
      Math.abs(rect.height - other.height) > TOUCH_PT
    )
      return false;
  }
  return true;
}

function overlap(a: QaRect, b: QaRect): boolean {
  return (
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > TOUCH_PT &&
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > TOUCH_PT
  );
}

/**
 * What goes wrong in one header row: two of its controls drawn over each other (a long title
 * under the crew pill), or one running off the side of the screen (a pill pushed past the edge).
 * Each problem is a subject for a HEADER_OVERLAP report.
 */
export function headerLayoutProblems(
  rects: ReadonlyMap<string, QaRect>,
  windowWidth: number,
): string[] {
  const entries = [...rects].filter(([, rect]) => rect.width > 0 && rect.height > 0);
  const problems: string[] = [];
  entries.forEach(([id, rect], index) => {
    for (const [other, otherRect] of entries.slice(index + 1)) {
      if (overlap(rect, otherRect)) problems.push(`${id} overlaps ${other}`);
    }
    if (rect.x < -TOUCH_PT || rect.x + rect.width > windowWidth + TOUCH_PT)
      problems.push(`${id} runs off the screen`);
  });
  return problems;
}

export interface HeaderOverlapGuard {
  /** Put on the header row: every layout pass re-measures its controls. */
  readonly onLayout: () => void;
  /** A ref for one control of the row, named for the report. */
  readonly ref: (id: string) => (node: QaMeasurable | null) => void;
}

const NO_GUARD: HeaderOverlapGuard = { onLayout: () => undefined, ref: () => () => undefined };

/**
 * Reports HEADER_OVERLAP when controls of one header row (`name`) collide or leave the screen.
 * The report carries where each control of the row was and the window's width, so a report shows
 * which side a control left by and how far.
 * Development and e2e builds only; elsewhere the handlers do nothing.
 */
export function useHeaderOverlapGuard(name: string): HeaderOverlapGuard {
  const nodes = useRef(new Map<string, QaMeasurable>());
  const refs = useRef(new Map<string, (node: QaMeasurable | null) => void>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const measure = useCallback(() => {
    const sample = (previous: ReadonlyMap<string, QaRect> | null, samples: number) => {
      const rects = new Map<string, QaRect>();
      const pending = [...nodes.current];
      let left = pending.length;
      for (const [id, node] of pending) {
        node.measureInWindow((x, y, width, height) => {
          rects.set(id, { x, y, width, height });
          left -= 1;
          if (left > 0) return;
          if (previous === null || !sameRects(previous, rects)) {
            if (samples < MAX_SAMPLES)
              timer.current = setTimeout(() => sample(rects, samples + 1), SETTLE_MS);
            return;
          }
          const windowWidth = Dimensions.get('window').width;
          const problems = headerLayoutProblems(rects, windowWidth);
          if (problems.length === 0) return;
          const row = [...rects]
            .map(([id, r]) => `${id} x=${Math.round(r.x)} w=${Math.round(r.width)}`)
            .join(', ');
          for (const problem of problems)
            reportUiQa(
              'HEADER_OVERLAP',
              `${name}: ${problem}`,
              `(${row}; window ${Math.round(windowWidth)})`,
            );
        });
      }
    };
    sample(null, 1);
  }, [name]);

  const onLayout = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(measure, SETTLE_MS);
  }, [measure]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const ref = useCallback((id: string) => {
    const known = refs.current.get(id);
    if (known) return known;
    const next = (node: QaMeasurable | null) => {
      if (node) nodes.current.set(id, node);
      else nodes.current.delete(id);
    };
    refs.current.set(id, next);
    return next;
  }, []);

  return useMemo(() => (UI_QA_ENABLED ? { onLayout, ref } : NO_GUARD), [onLayout, ref]);
}
