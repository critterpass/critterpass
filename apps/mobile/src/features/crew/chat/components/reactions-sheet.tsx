/**
 * Who reacted to a message: each emoji with its count, then the people behind it (avatars and
 * first names). Opened from the reaction chips under a bubble.
 */
import { plural, t } from '@lingui/core/macro';
import { View } from 'react-native';

import { Avatar } from '@/ui/people/Avatar';
import { Sheet } from '@/ui/sheet/Sheet';
import { Row, Stack, Text, useTheme } from '@/ui';
import { makeStyles } from '@/ui/theme';

import type { ReactionGroup } from '../data/use-reactions';
import { firstName } from '../data/use-typing';

const useStyles = makeStyles((th) => ({
  body: { padding: th.space['16'], gap: th.space['16'] },
  person: { alignItems: 'center', gap: th.space['10'] },
}));

export function ReactionsSheet({
  groups,
  joinIndex,
  onClose,
}: {
  readonly groups: readonly ReactionGroup[];
  readonly joinIndex: ReadonlyMap<string, number>;
  readonly onClose: () => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Sheet
      detents={['fit', 'large']}
      onDismiss={onClose}
      accessibilityLabel={t({ id: 'chat.reactions.title', message: 'Reactions' })}
      testID="chat-reactions"
    >
      <View style={styles.body}>
        {groups.map((group) => (
          <Stack key={group.emoji} gap="8">
            <Text variant="title">
              {group.emoji}{' '}
              <Text variant="caption" color={theme.semantic.text.secondary}>
                {t({
                  id: 'chat.reactions.count',
                  message: plural(group.count, { one: '# person', other: '# people' }),
                })}
              </Text>
            </Text>
            {group.users.map((user) => {
              const name =
                firstName(user.name) ?? t({ id: 'chat.quote.someone', message: 'Someone' });
              return (
                <Row key={user.uid} style={styles.person}>
                  <Avatar
                    name={name}
                    joinIndex={joinIndex.get(user.uid) ?? 0}
                    size="sm"
                    decorative
                  />
                  <Text variant="body">{name}</Text>
                </Row>
              );
            })}
          </Stack>
        ))}
      </View>
    </Sheet>
  );
}

/** The chips under a bubble: each emoji and its count, the member's own highlighted. */
export function ReactionChips({
  groups,
  onToggle,
  onShowAll,
}: {
  readonly groups: readonly ReactionGroup[];
  readonly onToggle: (emoji: string) => void;
  readonly onShowAll: () => void;
}) {
  const theme = useTheme();
  if (groups.length === 0) return null;
  return (
    <Row gap="4" wrap testID="chat-reaction-chips">
      {groups.map((group) => (
        <Text
          key={group.emoji}
          variant="caption"
          accessibilityRole="button"
          accessibilityLabel={t({
            id: 'chat.reactions.chip',
            message: `${group.emoji} ${group.count}`,
          })}
          accessibilityState={{ selected: group.mine }}
          onPress={() => onToggle(group.emoji)}
          onLongPress={onShowAll}
          style={{
            paddingHorizontal: theme.space['8'],
            paddingVertical: theme.space['4'],
            borderRadius: theme.radius.lg,
            overflow: 'hidden',
            backgroundColor: group.mine ? theme.semantic.bg.control : theme.semantic.bg.raised,
          }}
        >
          {group.emoji} {group.count}
        </Text>
      ))}
    </Row>
  );
}
