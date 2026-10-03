/**
 * The planning-mode timeline (3e-2): the hour grid, the day's blocks in their lanes, and the
 * editing loop — lift (haptic), every 15-minute row crossed (snap haptic) with the others reflowing
 * out of the way, and on drop one commit of every block that moved (drop haptic). A drop that
 * would push a booked block is refused with a shake. Travel legs too short for the drive between
 * two places are flagged on the later block. Overlays (rain, the guide's ghost, remote cursors)
 * draw on the same grid.
 */
import { useLingui } from '@lingui/react/macro';
import { useEffect, useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';

import type { PlanOp } from '@cp/domain';

import { impact } from '@/motion/feedback';
import { useMotionMode } from '@/motion/motion-mode';
import { InfoPill } from '@/ui/chips/InfoPill';
import { makeStyles, useTheme } from '@/ui/theme';

import { blockColor } from '../day/category-color';
import { dayFit } from '../day/fit-check';
import type { Axis } from './geometry';
import { GuideGhost } from './guide-ghost';
import { TimelineBlock, type BlockFrame } from './timeline-block';
import { TimelineGrid } from './timeline-grid';
import { buildTimeline, opsFor, type Placed, type Preview } from './timeline-model';
import { type DayItem } from '@/data/plan/plan-model';
import { type DaySlot } from '@/data/plan/plan-ops';

/** Committed positions wait this long for the synced plan before letting go. */
const OVERRIDE_TTL_MS = 4000;
const NO_OVERRIDES: ReadonlyMap<string, Placed> = new Map();

export interface TimelineGhost {
  readonly itemId: string;
  readonly start: number;
  readonly end: number;
  readonly detail: string;
  /** Accepted: the item glides into the ghost's place and the ghost fades. */
  readonly accepted: boolean;
  readonly onAccept: () => void;
}

const GHOST_ID = 'guide-ghost';

export interface TimelineOverlayContext {
  readonly axis: Axis;
  readonly width: number;
  readonly frames: ReadonlyMap<string, BlockFrame>;
}

export interface TimelineEditorProps {
  readonly items: readonly DayItem[];
  readonly day: DaySlot;
  readonly members: readonly string[];
  readonly meta: (item: DayItem) => string;
  readonly pending: (id: string) => boolean;
  readonly editable: boolean;
  readonly onOpen: (item: DayItem) => void;
  readonly onCommit: (ops: readonly PlanOp[]) => void;
  /** While a block is lifted: the item and how far it has moved (for presence). */
  readonly onPreview?: (id: string | null, offset: number) => void;
  /** Drawn under the blocks (rain band) and over them (ghost, cursors). */
  readonly under?: (ctx: TimelineOverlayContext) => ReactNode;
  readonly over?: (ctx: TimelineOverlayContext) => ReactNode;
  /** Fixed preview for the lab (a lifted or mid-drag block). */
  readonly initialPreview?: Preview | null;
  /** The block shown lifted in that preview. */
  readonly liftedId?: string;
  /** The guide's suggested slot for one of the day's items. */
  readonly ghost?: TimelineGhost | null;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  warning: { position: 'absolute', zIndex: 20, alignItems: 'flex-end' },
  root: { marginTop: th.space['8'] },
}));

export function TimelineEditor(props: TimelineEditorProps) {
  const { items, day, editable } = props;
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  const [motionMode] = useMotionMode();
  const [width, setWidth] = useState(0);
  const [preview, setPreview] = useState<Preview | null>(props.initialPreview ?? null);
  const [overrides, setOverrides] = useState<ReadonlyMap<string, Placed>>(NO_OVERRIDES);
  const [shakes, setShakes] = useState<ReadonlyMap<string, number>>(new Map());
  // Committed positions stay until the synced plan (or the queue read-back) shows them.
  const settled = [...overrides].every(([id, at]) => {
    const item = items.find((candidate) => candidate.stableId === id);
    return (
      item === undefined ||
      (item.start === at.start && item.end === at.end && item.lane === at.lane)
    );
  });
  const shown = settled ? NO_OVERRIDES : overrides;
  useEffect(() => {
    if (overrides.size === 0) return undefined;
    const timer = setTimeout(() => setOverrides(NO_OVERRIDES), settled ? 0 : OVERRIDE_TTL_MS);
    return () => clearTimeout(timer);
  }, [overrides, settled]);
  const ghost = props.ghost ?? null;
  const extra = ghost === null ? null : { id: GHOST_ID, start: ghost.start, end: ghost.end };
  const model = buildTimeline(items, shown, preview, width, extra);
  const resting = buildTimeline(items, shown, null, width, extra);
  const ghostFrame = model.frames.get(GHOST_ID);

  const byId = new Map(items.map((item) => [item.stableId, item]));
  const lanes = model.lanes;
  const laneIndex = (lane: string | null) => Math.max(0, lanes.indexOf(lane));

  function shake(id: string) {
    impact('error');
    setShakes((current) => new Map(current).set(id, (current.get(id) ?? 0) + 1));
  }

  function land(next: Preview) {
    const landed = buildTimeline(items, shown, next, width, extra);
    setPreview(null);
    props.onPreview?.(null, 0);
    if (landed.blocked) {
      shake(next.id);
      return;
    }
    const ops = opsFor(items, resting.placed, landed.placed, day);
    if (ops.length === 0) return;
    // eslint-disable-next-line lingui/no-unlocalized-strings -- a sound cue id, never copy.
    impact('thud.soft');
    setOverrides(landed.placed);
    props.onCommit(ops);
  }

  const warnings =
    day.date === ''
      ? []
      : dayFit(
          items.map((item) => {
            const at = model.placed.get(item.stableId);
            return at === undefined ? item : { ...item, start: at.start, end: at.end };
          }),
          day.date,
          props.members,
        );

  const ctx = { axis: model.axis, width, frames: model.frames };
  return (
    <View
      style={[styles.root, { height: model.height + theme.space['24'] }]}
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      testID={props.testID ?? 'plan-timeline'}
    >
      <TimelineGrid axis={model.axis} />
      {width > 0 ? props.under?.(ctx) : null}
      {width > 0
        ? [...model.frames].map(([id, placedFrame]) => {
            const item = byId.get(id);
            const accepting = ghost?.accepted === true && ghost.itemId === id;
            const frame = accepting && ghostFrame !== undefined ? ghostFrame : placedFrame;
            const at = model.placed.get(id);
            if (item === undefined || at === undefined) return null;
            const original = resting.placed.get(id) ?? at;
            const step = (next: Preview) => land(next);
            return (
              <TimelineBlock
                key={id}
                block={{
                  id,
                  title: item.title,
                  meta: props.meta({ ...item, start: at.start, end: at.end }),
                  color: blockColor(theme, item),
                  start: at.start,
                  end: at.end,
                  fixed: item.lock === 'booking',
                  pending: props.pending(id),
                }}
                frame={frame}
                editable={editable}
                shakeToken={shakes.get(id) ?? 0}
                lifted={props.liftedId === id}
                struck={ghost !== null && !ghost.accepted && ghost.itemId === id}
                accepting={accepting}
                drag={{
                  min: model.axis.start,
                  max: model.axis.end,
                  lane: laneIndex(at.lane),
                  lanes: lanes.length,
                  laneStep: Math.max(frame.width, (width - frame.left) / Math.max(2, lanes.length)),
                  reduced: motionMode !== 'full',
                }}
                handlers={{
                  onLift: () => {
                    impact('tick');
                    props.onPreview?.(id, 0);
                  },
                  onSlot: (start, lane) => {
                    impact('snap');
                    setPreview({ kind: 'move', id, start, lane: lanes[lane] ?? null });
                    props.onPreview?.(id, start - original.start);
                  },
                  onDrop: (start, lane) =>
                    land({ kind: 'move', id, start, lane: lanes[lane] ?? null }),
                  onResize: (start, end) => {
                    impact('snap');
                    setPreview({ kind: 'resize', id, start, end });
                  },
                  onResizeEnd: (start, end) => land({ kind: 'resize', id, start, end }),
                  onOpen: () => props.onOpen(item),
                  onStep: (minutes) =>
                    step({
                      kind: 'move',
                      id,
                      start: original.start + minutes,
                      lane: original.lane,
                    }),
                  onResizeStep: (minutes) =>
                    step({
                      kind: 'resize',
                      id,
                      start: original.start,
                      end: Math.max(original.start + 15, original.end + minutes),
                    }),
                  onNextLane: () =>
                    step({
                      kind: 'move',
                      id,
                      start: original.start,
                      lane: lanes[(laneIndex(original.lane) + 1) % lanes.length] ?? null,
                    }),
                }}
              />
            );
          })
        : null}
      {width > 0
        ? warnings.map((warning) => {
            const frame =
              warning.stableId === null ? undefined : model.frames.get(warning.stableId);
            if (frame === undefined) return null;
            return (
              <View
                key={`${warning.code}:${warning.stableId}:${warning.relatedId}`}
                style={[
                  styles.warning,
                  {
                    top: frame.top - theme.space['14'],
                    left: frame.left,
                    width: frame.width - theme.space['8'],
                  },
                ]}
                pointerEvents="none"
              >
                <InfoPill icon="car">
                  {warning.code === 'TRAVEL_TOO_LONG'
                    ? t({
                        id: 'plan.timeline.travelShort',
                        message: `${warning.minutes ?? 0} min short to get here`,
                      })
                    : t({ id: 'plan.timeline.overlap', message: 'Overlaps' })}
                </InfoPill>
              </View>
            );
          })
        : null}
      {width > 0 && ghost !== null && ghostFrame !== undefined ? (
        <GuideGhost
          frame={ghostFrame}
          title={byId.get(ghost.itemId)?.title ?? ''}
          start={ghost.start}
          detail={ghost.detail}
          accepted={ghost.accepted}
          onAccept={ghost.onAccept}
        />
      ) : null}
      {width > 0 ? props.over?.(ctx) : null}
    </View>
  );
}
