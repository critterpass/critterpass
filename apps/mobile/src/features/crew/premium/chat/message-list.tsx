/**
 * The premium timeline (FlashList, rendered from the bottom): the newest message stays pinned just
 * above the composer as the keyboard or the sticker tray opens, dragging the list dismisses the
 * keyboard interactively, scrolling to the top loads older messages, and sitting at the bottom moves
 * the read marker. Scrolled up, the counted "New messages ↓" pill rises from the composer and jumps
 * back down.
 */
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Platform,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';

import { makePremiumStyles } from '@/ui/premium';

import type { ChatMessage } from '../../chat/data/rows';
import type { TimelineRow } from '../../chat/components/timeline-rows';
import { NewMessagesPill } from './chat-chips';

const AT_BOTTOM_PX = 48;
const SETTLE_MS = 120;

export interface PremiumMessageListProps {
  readonly rows: readonly TimelineRow[];
  readonly renderRow: (row: TimelineRow) => ReactNode;
  readonly isMine: (message: ChatMessage) => boolean;
  /** Clear space above the list's first row (under the header) and below its last (the composer). */
  readonly topInset: number;
  readonly bottomInset: number;
  readonly header?: ReactNode;
  readonly footer?: ReactNode;
  readonly onLoadOlder: () => void;
  readonly onSeenLatest: (seq: number) => void;
}

const useStyles = makePremiumStyles((th) => ({
  list: { flex: 1 },
  row: { paddingVertical: th.space.gap4 / 2 },
  pill: { position: 'absolute', alignSelf: 'center' },
}));

const rowKey = (row: TimelineRow) => row.key;
const rowType = (row: TimelineRow) => (row.kind === 'message' ? row.message.type : row.kind);

function newestSeq(rows: readonly TimelineRow[]): number {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (row?.kind === 'message' && row.message.seq !== null) return row.message.seq;
  }
  return 0;
}

/** Crewmates' messages numbered past `seen`: what the pill counts. */
export function unseenCount(
  rows: readonly TimelineRow[],
  seen: number,
  isMine: (message: ChatMessage) => boolean,
): number {
  let count = 0;
  for (const row of rows) {
    if (row.kind !== 'message') continue;
    const { seq } = row.message;
    if (seq !== null && seq > seen && !isMine(row.message) && row.message.senderKind !== 'system') {
      count += 1;
    }
  }
  return count;
}

export function PremiumMessageList({
  rows,
  renderRow,
  isMine,
  topInset,
  bottomInset,
  header,
  footer,
  onLoadOlder,
  onSeenLatest,
}: PremiumMessageListProps) {
  const styles = useStyles();
  const list = useRef<FlashListRef<TimelineRow>>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [seen, setSeen] = useState(0);
  const height = useRef(0);
  const newest = useMemo(() => newestSeq(rows), [rows]);
  const following = useRef(true);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (settle.current !== null) clearTimeout(settle.current);
    },
    [],
  );
  // Whatever arrived while at the bottom counts as seen.
  if (atBottom && seen !== newest) setSeen(newest);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
      const bottom =
        contentOffset.y + layoutMeasurement.height >= contentSize.height - AT_BOTTOM_PX;
      following.current = bottom;
      setAtBottom(bottom);
      if (bottom && newest > 0) onSeenLatest(newest);
    },
    [newest, onSeenLatest],
  );
  const onContentSizeChange = useCallback(() => {
    if (following.current) list.current?.scrollToEnd({ animated: true });
  }, []);
  const onScrollBeginDrag = useCallback(() => {
    following.current = false;
  }, []);
  // The keyboard, the tray or a taller composer shortens the list from below: a member reading the
  // newest message keeps it in view, with no jump.
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    const previous = height.current;
    height.current = next;
    if (previous === 0 || next === previous || !following.current) return;
    const toEnd = () => {
      if (following.current) list.current?.scrollToEnd({ animated: false });
    };
    toEnd();
    if (settle.current !== null) clearTimeout(settle.current);
    settle.current = setTimeout(toEnd, SETTLE_MS);
  }, []);
  const renderItem = useCallback(
    ({ item }: { readonly item: TimelineRow }) => <View style={styles.row}>{renderRow(item)}</View>,
    [styles.row, renderRow],
  );
  const onEndReached = useCallback(() => {
    if (newest > 0) onSeenLatest(newest);
  }, [newest, onSeenLatest]);
  const unseen = atBottom ? 0 : unseenCount(rows, seen, isMine);

  return (
    <View style={styles.list} onLayout={onLayout}>
      <FlashList
        ref={list}
        data={rows}
        keyExtractor={rowKey}
        getItemType={rowType}
        renderItem={renderItem}
        ListHeaderComponent={<>{header}</>}
        ListFooterComponent={<>{footer}</>}
        contentContainerStyle={{
          paddingHorizontal: 14,
          paddingTop: topInset,
          paddingBottom: bottomInset,
        }}
        maintainVisibleContentPosition={{ startRenderingFromBottom: true }}
        onContentSizeChange={onContentSizeChange}
        onScrollBeginDrag={onScrollBeginDrag}
        onScrollEndDrag={onScroll}
        onStartReached={onLoadOlder}
        onEndReached={onEndReached}
        onScroll={onScroll}
        scrollEventThrottle={100}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        testID="chat-list"
      />
      {atBottom ? null : (
        <Animated.View
          entering={FadeInDown}
          exiting={FadeOut}
          style={[styles.pill, { bottom: bottomInset + 16 }]}
        >
          <NewMessagesPill
            count={unseen}
            onPress={() => list.current?.scrollToEnd({ animated: true })}
          />
        </Animated.View>
      )}
    </View>
  );
}
