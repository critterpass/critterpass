/**
 * The quote above a reply: who wrote the original and its first line (or "Photo", "Voice note",
 * "Message deleted"), with a bar in the author's colour. Also the strip shown while writing one.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { Row, Stack, Text, useTheme } from '@/ui';
import { makeStyles } from '@/ui/theme';

import type { ChatMessage } from '../data/rows';
import { firstName } from '../data/use-typing';

const PREVIEW_MAX = 90;

export function quotePreview(message: ChatMessage | undefined): string {
  if (message === undefined) return t({ id: 'chat.quote.missing', message: 'Earlier message' });
  if (message.deleted) return t({ id: 'chat.message.deleted', message: 'Message deleted' });
  if (message.type === 'photo') return t({ id: 'chat.quote.photo', message: 'Photo' });
  if (message.type === 'voice') return t({ id: 'chat.quote.voice', message: 'Voice note' });
  const line = message.body.split('\n')[0] ?? '';
  return line.length > PREVIEW_MAX ? `${line.slice(0, PREVIEW_MAX - 1)}…` : line;
}

const useStyles = makeStyles((th) => ({
  row: { gap: th.space['8'], alignItems: 'stretch' },
  bar: { width: th.space['4'], borderRadius: th.space['2'] },
  text: { flexShrink: 1 },
}));

export function ReplyQuote({
  message,
  onDark = true,
}: {
  readonly message: ChatMessage | undefined;
  /** Drawn inside a dark bubble (theirs) or on the yellow one (mine). */
  readonly onDark?: boolean;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const ink = onDark ? theme.semantic.text.secondary : theme.semantic.text.onAccent;
  const author =
    message?.senderKind === 'guide'
      ? message.senderName
      : (firstName(message?.senderName) ?? t({ id: 'chat.quote.someone', message: 'Someone' }));
  return (
    <Row style={styles.row} testID="chat-reply-quote">
      <View style={[styles.bar, { backgroundColor: ink }]} />
      <Stack style={styles.text}>
        <Text variant="label" color={ink} numberOfLines={1}>
          {author ?? ''}
        </Text>
        <Text variant="bodySm" color={ink} numberOfLines={2}>
          {quotePreview(message)}
        </Text>
      </Stack>
    </Row>
  );
}
