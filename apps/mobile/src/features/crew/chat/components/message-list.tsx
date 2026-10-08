/**
 * The virtualised timeline (FlashList, rendered from the bottom): day separators, the "NEW"
 * divider, grouped bubbles and the typing row at the foot. Scrolling to the top loads the next
 * older window from the local database; sitting at the bottom reports the last message seen (for
 * the read marker); scrolled up, a "jump to latest" pill brings the member back down.
 */
import { t } from '@lingui/core/macro';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { FOOTER_FADE_PT } from '@/ui/layout/KeyboardFooter';
import { makeStyles, sizeToken } from '@/ui/theme';

import type { ChatMessage } from '../data/rows';
import { DaySeparator } from './day-separator';
import type { TimelineRow } from './timeline-rows';
import { UnreadDivider } from './unread-divider';

const AT_BOTTOM_PX = 48;
/** How long after the list's height last changed it is brought to its end once more. */
const SETTLE_MS = 120;

export interface MessageListProps {
  readonly rows: readonly TimelineRow[];
  readonly today: string;
  readonly renderMessage: (row: Extract<TimelineRow, { kind: 'message' }>) => ReactNode;
  /** Above the first message, once the whole history is loaded (the start of the chat). */
  readonly header?: ReactNode;
  readonly footer?: ReactNode;
  readonly onLoadOlder: () => void;
  /** The last numbered message is on screen at the bottom. */
  readonly onSeenLatest: (seq: number) => void;
}

const useStyles = makeStyles((th) => ({
  list: { flex: 1 },
  // The composer's fade covers the list's last FOOTER_FADE_PT: the newest message ends clear of it.
  content: { paddingHorizontal: th.space['12'], paddingBottom: FOOTER_FADE_PT + th.space['8'] },
  row: { paddingVertical: th.space['2'] },
  // Filled: the pill floats over the bubbles, and an outline alone lets a bubble show through it.
  jump: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: FOOTER_FADE_PT + th.space['8'],
    borderRadius: sizeToken(th.size.headerPill, 'height') / 2,
    backgroundColor: th.semantic.bg.raised,
  },
}));

const rowKey = (row: TimelineRow) => row.key;
const rowType = (row: TimelineRow) => (row.kind === 'message' ? row.message.type : row.kind);

export function lastSeq(messages: readonly ChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const seq = messages[i]?.seq;
    if (seq !== null && seq !== undefined) return seq;
  }
  return 0;
}

export function MessageList({
  rows,
  today,
  renderMessage,
  header,
  footer,
  onLoadOlder,
  onSeenLatest,
}: MessageListProps) {
  const styles = useStyles();
  const list = useRef<FlashListRef<TimelineRow>>(null);
  const [atBottom, setAtBottom] = useState(true);
  const height = useRef(0);
  const newest = useMemo(
    () => lastSeq(rows.flatMap((row) => (row.kind === 'message' ? [row.message] : []))),
    [rows],
  );

  // The newest message is in view: read by the layout handler, which outlives a render.
  const following = useRef(true);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (settle.current !== null) clearTimeout(settle.current);
    },
    [],
  );

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

  // A new message, or one that settles (its "sending" line goes), keeps the newest in view for a
  // member who is reading it. The list's own autoscroll is not used: it scrolls on the frame after
  // the change, so a member who has just started reading back is pulled to the end mid-drag.
  const onContentSizeChange = useCallback(() => {
    if (following.current) list.current?.scrollToEnd({ animated: true });
  }, []);
  // Taking hold of the list stops following at once, before the drag's first scroll event lands.
  const onScrollBeginDrag = useCallback(() => {
    following.current = false;
  }, []);

  // The composer growing (more lines, a reply strip) or the keyboard rising shortens the list from
  // below, and the keyboard closing lengthens it again; a member reading the newest message keeps
  // it, and its delivery line, in view and clear of the composer's fade. As the list grows Android
  // pulls the scroll position back before the list has moved its content down, which leaves the
  // newest bubble under the fade: the list is brought to its end on every change of height and
  // once more when the height has settled.
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

  // The list redraws every mounted row when `renderItem` changes: it changes only with the rows'
  // own inputs, never with the screen around the list.
  const renderItem = useCallback(
    ({ item }: { readonly item: TimelineRow }) => (
      <View style={styles.row}>
        {item.kind === 'day' ? (
          <DaySeparator day={item.day} today={today} />
        ) : item.kind === 'unread' ? (
          <UnreadDivider />
        ) : (
          renderMessage(item)
        )}
      </View>
    ),
    [styles.row, today, renderMessage],
  );
  const onEndReached = useCallback(() => {
    if (newest > 0) onSeenLatest(newest);
  }, [newest, onSeenLatest]);

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
        contentContainerStyle={styles.content}
        maintainVisibleContentPosition={{ startRenderingFromBottom: true }}
        onContentSizeChange={onContentSizeChange}
        onScrollBeginDrag={onScrollBeginDrag}
        // A drag that ends without moving the list says again whether the member is at the end.
        onScrollEndDrag={onScroll}
        onStartReached={onLoadOlder}
        onEndReached={onEndReached}
        onScroll={onScroll}
        scrollEventThrottle={100}
        keyboardDismissMode="interactive"
        testID="chat-list"
      />
      {atBottom ? null : (
        <View style={styles.jump}>
          <PillButton
            label={t({ id: 'chat.list.jumpToLatest', message: 'Jump to latest' })}
            size="sm"
            variant="secondary"
            onPress={() => list.current?.scrollToEnd({ animated: true })}
            testID="chat-jump-latest"
          />
        </View>
      )}
    </View>
  );
}
