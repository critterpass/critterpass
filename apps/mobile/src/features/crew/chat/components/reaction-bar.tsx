/**
 * The emoji bar at the top of a message's actions: six quick reactions, and "more" to pick any
 * emoji from the keyboard. The member's own current reactions are shown selected.
 */
import { QUICK_REACTIONS, isReactionEmoji } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { TextInput } from 'react-native';

import { PressScale } from '@/ui/press/PressScale';
import { Row, Text, useTheme } from '@/ui';
import { makeStyles, MIN_TOUCH_TARGET } from '@/ui/theme';

const useStyles = makeStyles((th) => ({
  bar: { alignItems: 'center', justifyContent: 'space-between', gap: th.space['4'] },
  emoji: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  more: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, textAlign: 'center' },
}));

export function ReactionBar({
  mine,
  onPick,
}: {
  readonly mine: ReadonlySet<string>;
  readonly onPick: (emoji: string) => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const [more, setMore] = useState(false);
  return (
    <Row style={styles.bar} testID="chat-reaction-bar">
      {QUICK_REACTIONS.map((emoji) => (
        <PressScale
          key={emoji}
          accessibilityLabel={t({ id: 'chat.react.with', message: `React with ${emoji}` })}
          accessibilityState={{ selected: mine.has(emoji) }}
          onPress={() => onPick(emoji)}
          style={[
            styles.emoji,
            mine.has(emoji) ? { backgroundColor: theme.semantic.bg.control } : null,
          ]}
        >
          <Text variant="h3">{emoji}</Text>
        </PressScale>
      ))}
      {more ? (
        <TextInput
          autoFocus
          style={[styles.more, { color: theme.semantic.text.primary }]}
          accessibilityLabel={t({ id: 'chat.react.anyEmoji', message: 'Type any emoji' })}
          onChangeText={(value) => {
            const emoji = Array.from(value.trim())[0] ?? '';
            if (isReactionEmoji(emoji)) onPick(emoji);
          }}
          testID="chat-reaction-more-input"
        />
      ) : (
        <PressScale
          accessibilityLabel={t({ id: 'chat.react.more', message: 'More reactions' })}
          onPress={() => setMore(true)}
          style={styles.emoji}
        >
          <Text variant="h3">+</Text>
        </PressScale>
      )}
    </Row>
  );
}
