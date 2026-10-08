/**
 * A question in the guide thread: the asker's own on the right, a crewmate's (GROUP) on the left
 * with their avatar. One that is still waiting for signal is the asker's own bubble in outline,
 * with a line under it saying so.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { Row, Stack, Text, makeStyles, useTheme } from '@/ui';
import { Avatar } from '@/ui/people/Avatar';

const useStyles = makeStyles((t) => ({
  row: { alignItems: 'flex-end', gap: t.space['8'] },
  mine: { justifyContent: 'flex-end' },
  bubble: {
    backgroundColor: t.semantic.bg.control,
    borderRadius: t.radius.lg,
    paddingHorizontal: t.space['14'],
    paddingVertical: t.space['10'],
    flexShrink: 1,
  },
  waiting: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: t.semantic.border.decorative,
  },
  note: { alignItems: 'flex-end' },
}));

export function QuestionBubble({
  text,
  author,
  waiting = false,
}: {
  readonly text: string;
  /** Null for the asker's own question. */
  readonly author: { readonly name: string; readonly joinIndex: number } | null;
  /** Asked with no signal: it is sent when the connection returns. */
  readonly waiting?: boolean;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  const bubble = (
    <Row
      style={[styles.row, author === null ? styles.mine : null]}
      testID={waiting ? 'guide-question-waiting' : 'guide-question'}
    >
      {author === null ? null : (
        <Avatar name={author.name} joinIndex={author.joinIndex} size="sm" decorative />
      )}
      <View style={[styles.bubble, waiting ? styles.waiting : null]}>
        <Text variant="body" {...(waiting ? { color: theme.semantic.text.secondary } : {})}>
          {text}
        </Text>
      </View>
    </Row>
  );
  if (!waiting) return bubble;
  return (
    <Stack gap="4">
      {bubble}
      <View style={styles.note}>
        <Text variant="caption" color={theme.semantic.text.tertiary}>
          {t({ id: 'guide.offline.waiting', message: 'Waiting for a connection' })}
        </Text>
      </View>
    </Stack>
  );
}
