/**
 * Keeps the guide thread on its newest line only while the reader is already there: new and
 * streamed words follow the bottom, a reader who scrolled up stays put, and older messages loaded
 * above ("Earlier messages") keep the line the reader was on in place.
 */
import { useMemo, useRef, type ComponentRef, type RefObject } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollView } from 'react-native';

/** How close to the end still counts as "at the bottom", in points. */
const BOTTOM_SLACK = 48;

export interface FollowBottom {
  readonly onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  readonly onLayout: () => void;
  readonly onContentSizeChange: (width: number, height: number) => void;
  /** Wraps a "load older" action so the content added above does not move the reader. */
  readonly keepPlace: (load: () => void) => () => void;
}

export function isNearBottom(offsetY: number, viewport: number, content: number): boolean {
  return offsetY + viewport >= content - BOTTOM_SLACK;
}

export function useFollowBottom(
  scroll: RefObject<ComponentRef<typeof ScrollView> | null>,
): FollowBottom {
  const atBottom = useRef(true);
  const offset = useRef(0);
  const content = useRef(0);
  const anchor = useRef<{ readonly y: number; readonly height: number } | null>(null);
  return useMemo<FollowBottom>(
    () => ({
      onScroll: (event) => {
        const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
        offset.current = contentOffset.y;
        atBottom.current = isNearBottom(
          contentOffset.y,
          layoutMeasurement.height,
          contentSize.height,
        );
      },
      // The keyboard or the composer growing shrinks the viewport: stay on the last line.
      onLayout: () => {
        if (atBottom.current) scroll.current?.scrollToEnd({ animated: false });
      },
      onContentSizeChange: (_width, height) => {
        const held = anchor.current;
        const previous = content.current;
        content.current = height;
        if (held !== null && height !== held.height) {
          anchor.current = null;
          scroll.current?.scrollTo({ y: held.y + height - held.height, animated: false });
          return;
        }
        if (atBottom.current && height !== previous) {
          scroll.current?.scrollToEnd({ animated: true });
        }
      },
      keepPlace: (load) => () => {
        anchor.current = { y: offset.current, height: content.current };
        atBottom.current = false;
        load();
      },
    }),
    [scroll],
  );
}
