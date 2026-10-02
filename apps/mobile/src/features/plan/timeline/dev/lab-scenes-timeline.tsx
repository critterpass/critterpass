/**
 * Plan lab scenes for planning mode (3e-2): the day as drawn, a block lifted, a block mid-drag with
 * the next one pushed along, the drop settled, a clash inside one lane, a read-only day, an
 * overnight pickup stretching the axis, and a live sandbox whose blocks really drag and resize
 * (the device flow drags one and reads the result).
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { t } from '@lingui/core/macro';
import { useEffect, useState, type ReactNode } from 'react';

import { toast } from '@/motion/island-toast';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { Text } from '@/ui/text/Text';

import { labDay } from '../../day/dev/lab-scenes-day';
import {
  LAB_DATE,
  LAB_ITEMS,
  LAB_MEMBERS,
  labGhostDetail,
  labMeta,
  LAB_TZ,
  LUNCH,
  SPA,
  TERRACES,
  WALK,
} from '../../day/dev/lab-fixtures';
import { minutesOnDay, type DayItem } from '../../day/plan-model';
import { GuideBanner } from '../guide-banner';
import { RainBand } from '../rain-band';
import { placeCursors, RemoteCursors } from '../remote-cursors';
import { TimelineEditor, type TimelineEditorProps } from '../timeline-editor';
import type { Preview } from '../timeline-model';

const noop = () => undefined;
const DAY = { dayNo: 3, date: LAB_DATE };

export function labTimeline(overrides: Partial<TimelineEditorProps> = {}): ReactNode {
  return (
    <TimelineEditor
      items={LAB_ITEMS}
      day={DAY}
      members={LAB_MEMBERS.map((member) => member.uid)}
      meta={labMeta}
      pending={() => false}
      editable
      onOpen={noop}
      onCommit={noop}
      {...overrides}
    />
  );
}

function planning(
  timeline: ReactNode,
  items: readonly DayItem[] = LAB_ITEMS,
  editable = true,
): ReactNode {
  return labDay({ planning: true, timeline, items, editable });
}

const lifted: Preview = {
  kind: 'move',
  id: TERRACES.stableId,
  start: TERRACES.start ?? 0,
  lane: null,
};
const dragging: Preview = { kind: 'move', id: TERRACES.stableId, start: 8 * 60, lane: null };
const dropped = LAB_ITEMS.map((item) =>
  item.stableId === TERRACES.stableId
    ? { ...item, start: 8 * 60, end: 12 * 60 }
    : item.stableId === LUNCH.stableId
      ? { ...item, start: 12 * 60, end: 13 * 60 + 15 }
      : item,
);
const clash = [
  ...LAB_ITEMS,
  { ...LUNCH, stableId: 'i-coffee', title: 'Coffee · Seniman', start: 12 * 60, end: 13 * 60 },
];
const overnight = [
  {
    ...TERRACES,
    stableId: 'i-pickup',
    title: 'Airport pickup',
    start: 3 * 60 + 30,
    end: 4 * 60 + 30,
  },
  ...LAB_ITEMS.slice(1),
  {
    ...TERRACES,
    stableId: 'i-late',
    title: 'Night market',
    start: 23 * 60,
    end: 24 * 60 + 30,
    category: 'food',
  },
];

/** Blocks that really move: every commit is applied here, and the last drop is printed. */
function Sandbox() {
  const [items, setItems] = useState<readonly DayItem[]>(LAB_ITEMS);
  const [last, setLast] = useState('');
  return planning(
    <>
      <TimelineEditor
        {...{
          items,
          day: DAY,
          members: [],
          meta: labMeta,
          pending: () => false,
          editable: true,
          onOpen: noop,
        }}
        onCommit={(ops) => {
          setItems((current) =>
            current.map((item) => {
              const op = ops.find(
                (candidate) => candidate.op !== 'reorder_days' && candidate.item === item.stableId,
              );
              if (op === undefined || (op.op !== 'move' && op.op !== 'resize')) return item;
              const start =
                op.new.starts_at === undefined
                  ? item.start
                  : minutesOnDay(op.new.starts_at, LAB_TZ, LAB_DATE);
              const end =
                op.new.ends_at === undefined
                  ? item.end
                  : minutesOnDay(op.new.ends_at, LAB_TZ, LAB_DATE);
              if (ops[0]?.op !== 'reorder_days' && op.item === ops[0]?.item)
                setLast(`${item.title} ${start}-${end}`);
              return { ...item, start, end };
            }),
          );
        }}
      />
      <Text variant="monoData" testID="plan-sandbox-last">
        {last}
      </Text>
    </>,
    items,
  );
}

const rain = ({ axis }: { readonly axis: Parameters<typeof RainBand>[0]['axis'] }) => (
  <RainBand start={13 * 60} end={15 * 60} axis={axis} reduced={false} />
);
const ghost = (accepted = false) => ({
  itemId: WALK.stableId,
  start: 17 * 60,
  end: 18 * 60,
  detail: labGhostDetail(),
  accepted,
  onAccept: noop,
});
const cursors =
  (offset: number) => (ctx: { readonly frames: Parameters<typeof placeCursors>[1] }) => (
    <RemoteCursors
      reduced={false}
      fades={false}
      cursors={placeCursors(
        [
          { uid: 'u-maya', anchor: `plan_item:${SPA.stableId}`, offset: 0, at: Date.now() },
          ...(offset === 0
            ? []
            : [{ uid: 'u-alex', anchor: `plan_item:${LUNCH.stableId}`, offset, at: Date.now() }]),
        ],
        ctx.frames,
        LAB_MEMBERS,
      )}
    />
  );
const banner = () => (
  <GuideBanner
    guide={GUIDE_STICKERS.tokek}
    line={t({
      id: 'plan.timeline.bannerRain',
      message: `Rain till ${'15:00'}. Move ${'Ridge walk'}?`,
    })}
    onAccept={noop}
    onDismiss={noop}
  />
);

/** The day as 3e-2 draws it: rain 13–15, Tokek's ghost for the ridge walk, Maya on the spa. */
function drawn(
  overrides: Partial<TimelineEditorProps> = {},
  footer: ReactNode = banner(),
): ReactNode {
  return labDay({
    planning: true,
    footer,
    timeline: labTimeline({ under: rain, over: cursors(0), ghost: ghost(), ...overrides }),
  });
}

function ConflictToast() {
  useEffect(() => {
    toast.show({
      id: 'plan-conflict',
      title: 'Maya moved this too',
      subtitle: 'Their change stays. Try yours again.',
    });
  }, []);
  return planning(labTimeline());
}

export const TIMELINE_SCENES: Readonly<Record<string, () => ReactNode>> = {
  planning: () => planning(labTimeline()),
  'planning-lifted': () =>
    planning(labTimeline({ initialPreview: lifted, liftedId: TERRACES.stableId })),
  'planning-dragging': () =>
    planning(labTimeline({ initialPreview: dragging, liftedId: TERRACES.stableId })),
  'planning-dropped': () => planning(labTimeline({ items: dropped }), dropped),
  'planning-clash': () => planning(labTimeline({ items: clash }), clash),
  'planning-read-only': () => planning(labTimeline({ editable: false }), LAB_ITEMS, false),
  'planning-overnight': () => planning(labTimeline({ items: overnight }), overnight),
  'planning-sandbox': () => <Sandbox />,
  'planning-rain-ghost': () => drawn(),
  'planning-ghost-accepted': () => drawn({ ghost: ghost(true) }, null),
  'planning-cursors': () => drawn({ over: cursors(90) }),
  'planning-no-forecast': () =>
    labDay({ planning: true, rain: null, forecastMissing: true, timeline: labTimeline() }),
  'planning-conflict': () => <ConflictToast />,
};
