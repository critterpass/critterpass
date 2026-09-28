/**
 * The virtualised timeline (FlashList, rendered from the bottom): day separators, the "NEW"
 * divider, grouped bubbles and the typing row at the foot. Scrolling to the top loads the next
 * older window from the local database; sitting at the bottom reports the last message seen (for
 * the read marker); scrolled up, a "jump to latest" pill brings the member back down.
 */
import { t } from '@lingui/core/macro';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { makeStyles } from '@/ui/theme';

import type { ChatMessage } from '../data/rows';
import { DaySeparator } from './day-separator';
import type { TimelineRow } from './timeline-rows';
import { UnreadDivider } from './unread-divider';

const AT_BOTTOM_PX = 48;

export interface MessageListProps {
  readonly rows: readonly TimelineRow[];
  readonly today: string;
  readonly renderMessage: (row: Extract<TimelineRow, { kind: 'message' }>) => ReactNode;
  readonly footer?: ReactNode;
  readonly onLoadOlder: () => void;
  /** The last numbered message is on screen at the bottom. */
  readonly onSeenLatest: (seq: number) => void;
}

const useStyles = makeStyles((th) => ({
  list: { flex: 1 },
  content: { paddingHorizontal: th.space['12'], paddingBottom: th.space['8'] },
  row: { paddingVertical: th.space['2'] },
  jump: { position: 'absolute', alignSelf: 'center', bottom: th.space['8'] },
}));

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
  footer,
  onLoadOlder,
  onSeenLatest,
}: MessageListProps) {
  const styles = useStyles();
  const list = useRef<FlashListRef<TimelineRow>>(null);
  const [atBottom, setAtBottom] = useState(true);
  const newest = useMemo(
    () => lastSeq(rows.flatMap((row) => (row.kind === 'message' ? [row.message] : []))),
    [rows],
  );

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
      const bottom =
        contentOffset.y + layoutMeasurement.height >= contentSize.height - AT_BOTTOM_PX;
      setAtBottom(bottom);
      if (bottom && newest > 0) onSeenLatest(newest);
    },
    [newest, onSeenLatest],
  );

  return (
    <View style={styles.list}>
      <FlashList
        ref={list}
        data={rows}
        keyExtractor={(row) => row.key}
        getItemType={(row) => (row.kind === 'message' ? row.message.type : row.kind)}
        renderItem={({ item }) => (
          <View style={styles.row}>
            {item.kind === 'day' ? (
              <DaySeparator day={item.day} today={today} />
            ) : item.kind === 'unread' ? (
              <UnreadDivider />
            ) : (
              renderMessage(item)
            )}
          </View>
        )}
        ListFooterComponent={<>{footer}</>}
        contentContainerStyle={styles.content}
        maintainVisibleContentPosition={{
          startRenderingFromBottom: true,
          autoscrollToBottomThreshold: 0.2,
        }}
        onStartReached={onLoadOlder}
        onEndReached={() => {
          if (newest > 0) onSeenLatest(newest);
        }}
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
