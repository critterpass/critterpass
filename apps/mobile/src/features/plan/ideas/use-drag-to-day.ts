/**
 * Dragging an idea onto a day (7f-2): the chip row's place on screen is read when a row lifts, the
 * row reports which chip it is over only when that changes (so the chips glow without a render per
 * frame), and a drop on a chip opens Add to plan on that day. The list stops scrolling while a row
 * is lifted.
 */
import { useCallback, useRef, useState, type ComponentRef, type RefObject } from 'react';
import type { View } from 'react-native';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

import type { ChipLayout, ChipRowFrame } from './drag-hit';

export interface DragToDay {
  readonly chipsRef: RefObject<ComponentRef<typeof View> | null>;
  readonly frame: SharedValue<ChipRowFrame>;
  readonly layout: SharedValue<ChipLayout>;
  /** The idea lifted, or null. */
  readonly dragging: string | null;
  /** The day number under the lifted idea, or null. */
  readonly overDayNo: number | null;
  readonly lift: (ideaId: string) => void;
  readonly over: (index: number) => void;
  readonly drop: (ideaId: string, index: number) => void;
  readonly cancel: () => void;
}

const EMPTY_FRAME: ChipRowFrame = { x: 0, y: 0, width: 0, height: 0 };

export function useDragToDay(
  dayNos: readonly number[],
  onDrop: (ideaId: string, dayNo: number) => void,
): DragToDay {
  const chipsRef = useRef<ComponentRef<typeof View>>(null);
  const frame = useSharedValue<ChipRowFrame>(EMPTY_FRAME);
  const layout = useSharedValue<ChipLayout>({ count: 0, gap: 6, slotWidth: null, scrollX: 0 });
  const [dragging, setDragging] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState(-1);

  const lift = useCallback(
    (ideaId: string) => {
      setDragging(ideaId);
      setOverIndex(-1);
      const count = dayNos.length;
      layout.set({ count, gap: 6, slotWidth: count > 8 ? 44 : null, scrollX: 0 });
      chipsRef.current?.measureInWindow((x, y, width, height) => {
        frame.set({ x, y, width, height });
      });
    },
    [dayNos.length, frame, layout],
  );
  const over = useCallback((index: number) => setOverIndex(index), []);
  const cancel = useCallback(() => {
    setDragging(null);
    setOverIndex(-1);
  }, []);
  const drop = useCallback(
    (ideaId: string, index: number) => {
      setDragging(null);
      setOverIndex(-1);
      const dayNo = dayNos[index];
      if (dayNo !== undefined) onDrop(ideaId, dayNo);
    },
    [dayNos, onDrop],
  );
  return {
    chipsRef,
    frame,
    layout,
    dragging,
    overDayNo: overIndex < 0 ? null : (dayNos[overIndex] ?? null),
    lift,
    over,
    drop,
    cancel,
  };
}
