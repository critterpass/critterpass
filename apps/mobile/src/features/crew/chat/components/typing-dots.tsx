/**
 * Who is typing, under the last message: "Maya is typing" for crewmates, and the guide's own
 * bouncing dots in a bubble beside its sticker (the only bouncing element in the chat).
 */
import { t } from '@lingui/core/macro';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { TypingDots } from '@/ui/chat/TypingDots';
import { Row, Text, useTheme } from '@/ui';
import { makeStyles } from '@/ui/theme';

import type { ChatMessage } from '../data/rows';

const useStyles = makeStyles((th) => ({
  row: { alignItems: 'center', gap: th.space['8'], paddingVertical: th.space['4'] },
  dots: {
    paddingHorizontal: th.space['12'],
    paddingVertical: th.space['10'],
    borderRadius: th.radius.lg,
    backgroundColor: th.semantic.bg.raised,
  },
}));

/** How long the guide's dots wait for its answer before giving up. */
export const GUIDE_REPLY_WAIT_MS = 45_000;

/**
 * The guide is writing back: a member's message that calls the guide became the newest one while
 * the chat was open. The dots go when anything newer lands (the guide's answer included) or after
 * `GUIDE_REPLY_WAIT_MS`, whichever is first.
 */
export function useGuideReplying(
  messages: readonly ChatMessage[],
  hasGuide: boolean,
  loaded: boolean,
): boolean {
  const newest = messages.at(-1);
  const newestId = newest?.id ?? null;
  const calls = hasGuide && newest?.senderKind === 'user' && newest.mentionsGuide;
  const [opened, setOpened] = useState<string | null | undefined>(undefined);
  const [expired, setExpired] = useState<string | null>(null);
  // What was newest when the chat opened never counts: its answer may be long given.
  if (opened === undefined && loaded) setOpened(newestId);
  const waiting = calls === true && opened !== undefined && newestId !== opened;
  useEffect(() => {
    if (!waiting) return undefined;
    const timer = setTimeout(() => setExpired(newestId), GUIDE_REPLY_WAIT_MS);
    return () => clearTimeout(timer);
  }, [waiting, newestId]);
  return waiting && expired !== newestId;
}

export function typingLine(names: readonly string[]): string | null {
  const [first, second] = names;
  if (first === undefined) return null;
  if (second === undefined) return t({ id: 'chat.typing.one', message: `${first} is typing` });
  if (names.length === 2) {
    return t({ id: 'chat.typing.two', message: `${first} and ${second} are typing` });
  }
  return t({ id: 'chat.typing.many', message: 'Several people are typing' });
}

export function TypingRow({
  names,
  guideTyping = false,
  guideColor,
}: {
  readonly names: readonly string[];
  readonly guideTyping?: boolean;
  readonly guideColor?: string;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const line = typingLine(names);
  if (line === null && !guideTyping) return null;
  return (
    <Row style={styles.row} accessibilityLiveRegion="polite" testID="chat-typing">
      {guideTyping ? (
        <View style={styles.dots}>
          <TypingDots color={guideColor ?? theme.semantic.text.secondary} />
        </View>
      ) : null}
      {line === null ? null : (
        <Text variant="caption" color={theme.semantic.text.secondary}>
          {line}
        </Text>
      )}
    </Row>
  );
}
