/**
 * What the timeline draws for a moment of editing: the day's timed items with any preview (a drag
 * or a resize in progress) and any committed-but-not-yet-synced positions applied, the reflow of
 * the others, lanes and each block's frame. Pure, so the drag, the screen-reader steps and the lab
 * scenes all place blocks the same way.
 */
import type { PlanOp } from '@cp/domain';

import type { DayItem } from '../day/plan-model';
import { moveOp, resizeOp, type DaySlot } from '../day/plan-ops';
import { AXIS_GUTTER, PT_PER_MINUTE, axisFor, yOf, type Axis } from './geometry';
import { layoutLanes } from './lane-layout';
import { reflow } from './reflow';
import type { BlockFrame } from './timeline-block';

export interface Placed {
  readonly start: number;
  readonly end: number;
  readonly lane: string | null;
}

export type Preview =
  | {
      readonly kind: 'move';
      readonly id: string;
      readonly start: number;
      readonly lane: string | null;
    }
  | { readonly kind: 'resize'; readonly id: string; readonly start: number; readonly end: number };

export interface TimelineModel {
  readonly axis: Axis;
  /** Lane keys in the day, main lane first. */
  readonly lanes: readonly (string | null)[];
  readonly placed: ReadonlyMap<string, Placed>;
  readonly frames: ReadonlyMap<string, BlockFrame>;
  /** The preview can't land (it would push a booked block or run out of day). */
  readonly blocked: boolean;
  readonly height: number;
}

export function timedItems(items: readonly DayItem[]): DayItem[] {
  return items.filter((item) => item.start !== null && item.end !== null);
}

/** A block that takes a lane without being an item (the guide's ghost). */
export interface ExtraBlock {
  readonly id: string;
  readonly start: number;
  readonly end: number;
}

export function buildTimeline(
  items: readonly DayItem[],
  overrides: ReadonlyMap<string, Placed>,
  preview: Preview | null,
  width: number,
  extra: ExtraBlock | null = null,
): TimelineModel {
  const timed = timedItems(items);
  const base = new Map<string, Placed>(
    timed.map((item) => [
      item.stableId,
      overrides.get(item.stableId) ?? {
        start: item.start ?? 0,
        end: item.end ?? 0,
        lane: item.lane,
      },
    ]),
  );
  const axis = axisFor(extra === null ? [...base.values()] : [...base.values(), extra]);
  const lanes: (string | null)[] = [null];
  for (const placed of base.values()) if (!lanes.includes(placed.lane)) lanes.push(placed.lane);

  let blocked = false;
  const placed = new Map(base);
  if (preview !== null && base.has(preview.id)) {
    const current = base.get(preview.id) as Placed;
    if (preview.kind === 'resize') {
      placed.set(preview.id, { ...current, start: preview.start, end: preview.end });
    } else {
      const result = reflow(
        timed.map((item) => {
          const at = base.get(item.stableId) as Placed;
          return {
            id: item.stableId,
            start: at.start,
            end: at.end,
            lane: at.lane,
            fixed: item.lock === 'booking',
          };
        }),
        { id: preview.id, start: preview.start, lane: preview.lane },
        { min: axis.start, max: axis.end },
      );
      if (result.ok) {
        for (const [id, start] of result.starts) {
          const at = base.get(id) as Placed;
          placed.set(id, {
            start,
            end: start + (at.end - at.start),
            lane: id === preview.id ? preview.lane : at.lane,
          });
        }
      } else {
        blocked = true;
        const length = current.end - current.start;
        placed.set(preview.id, {
          start: preview.start,
          end: preview.start + length,
          lane: preview.lane,
        });
      }
    }
  }

  const everything =
    extra === null ? placed : new Map(placed).set(extra.id, { ...extra, lane: extra.id });
  const layout = layoutLanes([...everything].map(([id, at]) => ({ id, ...at })));
  const area = Math.max(0, width - AXIS_GUTTER);
  const frames = new Map<string, BlockFrame>();
  for (const [id, at] of everything) {
    const lane = layout.get(id) ?? { column: 0, columns: 1 };
    const columnWidth = area / lane.columns;
    frames.set(id, {
      top: yOf(at.start, axis),
      height: (at.end - at.start) * PT_PER_MINUTE,
      left: AXIS_GUTTER + lane.column * columnWidth,
      width: columnWidth,
    });
  }
  return { axis, lanes, placed, frames, blocked, height: (axis.end - axis.start) * PT_PER_MINUTE };
}

/** The ops a landed preview commits: every block whose place changed, as one edit. */
export function opsFor(
  items: readonly DayItem[],
  before: ReadonlyMap<string, Placed>,
  after: ReadonlyMap<string, Placed>,
  day: DaySlot,
): PlanOp[] {
  const ops: PlanOp[] = [];
  for (const item of timedItems(items)) {
    const was = before.get(item.stableId);
    const now = after.get(item.stableId);
    if (was === undefined || now === undefined) continue;
    const moved = now.start !== was.start || now.lane !== was.lane;
    const resized = now.end - now.start !== was.end - was.start;
    if (resized) ops.push(resizeOp(item, day, now.start, now.end));
    else if (moved) {
      const op = moveOp(
        { ...item, start: was.start, end: was.end },
        day,
        now.start,
        now.lane === was.lane ? undefined : now.lane,
      );
      if (op !== null) ops.push(op);
    }
  }
  return ops;
}
