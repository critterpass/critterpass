/**
 * The crew card's unread badge (the crews sheet's badge slot): a small count pill, hidden at zero,
 * "99+" past ninety-nine.
 */
import { plural, t } from '@lingui/core/macro';
import { StyleSheet, View } from 'react-native';

import { Text, useTheme } from '@/ui';

import { useUnreadCount } from '../data/use-unread-count';

export function unreadLabel(count: number): string {
  return count > 99 ? '99+' : String(count);
}

export function UnreadBadge({ crewId }: { readonly crewId: string }) {
  const count = useUnreadCount(crewId);
  const theme = useTheme();
  if (count === 0) return null;
  return (
    <View
      style={[styles.pill, { backgroundColor: theme.semantic.action.primary }]}
      accessible
      accessibilityLabel={t({
        id: 'chat.unread.label',
        message: plural(count, { one: '# unread message', other: '# unread messages' }),
      })}
    >
      <Text variant="label" color={theme.semantic.text.onAccent}>
        {unreadLabel(count)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
