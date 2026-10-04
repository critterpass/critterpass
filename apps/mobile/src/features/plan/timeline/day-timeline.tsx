/**
 * Planning mode for one live day: the timeline editor with the rain band under the blocks, the
 * guide's ghost in its own lane, and friends' cursors over them; my own drag goes out as a cursor
 * on the block with how far it has moved.
 */
import type { ReactNode } from 'react';

import type { PlanOp } from '@cp/domain';
import { useMotionMode } from '@/motion/motion-mode';
import { guideSticker, isGuideStickerId } from '@/ui/avatar/guides';

import { itemAnchor, type PlanPresence } from '../collab/use-presence';
import { RainBand } from './rain-band';
import { placeCursors, RemoteCursors } from './remote-cursors';
import { TimelineEditor, type TimelineGhost } from './timeline-editor';
import { useGuideSuggestion } from './use-guide-suggestion';
import { useRainWindow } from './use-rain-window';
import type { RainForecast } from './weather';
import { type DayItem } from '@/data/plan/plan-model';
import { type DaySlot } from '@/data/plan/plan-ops';
import { type TripPlan } from '@/data/plan/use-trip-plan';

export function guideOf(slug: string | null) {
  return guideSticker(isGuideStickerId(slug) ? slug : 'tokek');
}

/** Rain, the guide's suggestion and its banner for a day. */
export function useDayOverlays(plan: TripPlan, day: DaySlot, items: readonly DayItem[]) {
  const tz = plan.trip?.tz ?? 'UTC';
  const rain = useRainWindow(
    plan.trip?.destination_id ?? null,
    day.date === '' ? null : day.date,
    tz,
  );
  const suggestion = useGuideSuggestion({
    tripId: plan.trip?.id ?? '',
    changesets: plan.openChangesets,
    items,
    date: day.date === '' ? null : day.date,
    rain,
    guide: guideOf(plan.trip?.guide_slug ?? null),
    currentVersionId: plan.trip?.current_version_id ?? null,
  });
  return { rain, ...suggestion };
}

export function DayTimeline({
  plan,
  day,
  items,
  meta,
  editable,
  rain,
  ghost,
  presence,
  onOpen,
  onCommit,
}: {
  readonly plan: TripPlan;
  readonly day: DaySlot;
  readonly items: readonly DayItem[];
  readonly meta: (item: DayItem) => string;
  readonly editable: boolean;
  readonly rain: RainForecast;
  readonly ghost: TimelineGhost | null;
  readonly presence: PlanPresence;
  readonly onOpen: (item: DayItem) => void;
  readonly onCommit: (ops: readonly PlanOp[]) => void;
}): ReactNode {
  const [motionMode] = useMotionMode();
  const reduced = motionMode !== 'full';
  return (
    <TimelineEditor
      items={items}
      day={day}
      members={plan.members.map((member) => member.uid)}
      meta={meta}
      pending={(id) => plan.queued.has(id) || plan.proposed.has(id)}
      editable={editable}
      onOpen={onOpen}
      onCommit={onCommit}
      ghost={ghost}
      onPreview={(id, offset) => presence.setCursor(id === null ? null : itemAnchor(id), offset)}
      under={({ axis }) =>
        rain.kind === 'rain' ? (
          <RainBand start={rain.start} end={rain.end} axis={axis} reduced={reduced} />
        ) : null
      }
      over={({ frames }) => (
        <RemoteCursors
          cursors={placeCursors(presence.cursors, frames, plan.members)}
          reduced={reduced}
        />
      )}
    />
  );
}
