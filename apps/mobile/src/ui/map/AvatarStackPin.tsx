/**
 * A pin for a place multiple crew members are at: up to 3 overlapping avatars, "+N" beyond that
 * (F-031 "Pins": "avatar stack (≤3 + '+N')", "pin with >3 avatars" missing state). Selected state
 * enlarges with a yellow outline, same as `DoodlePin`.
 */
import { tokens } from '@cp/design-tokens';
import { useLingui } from '@lingui/react/macro';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const MAX_VISIBLE_AVATARS = 3;

export interface AvatarStackMember {
  readonly id: string;
  readonly initial: string;
}

export interface AvatarStackPinProps {
  readonly members: readonly AvatarStackMember[];
  readonly selected?: boolean;
  readonly onPress?: () => void;
}

export function AvatarStackPin({ members, selected = false, onPress }: AvatarStackPinProps) {
  const { t } = useLingui();
  const visible = members.slice(0, MAX_VISIBLE_AVATARS);
  const overflow = members.length - visible.length;
  const names = members.map((member) => member.initial).join(', ');
  const label =
    overflow > 0
      ? t({
          id: 'map.avatarStackPin.accessibilityLabelOverflow',
          // eslint-disable-next-line @typescript-eslint/no-base-to-string, @typescript-eslint/restrict-template-expressions
          message: `${{ names }}, and ${{ overflow }} more here`,
        })
      : t({
          id: 'map.avatarStackPin.accessibilityLabel',
          // eslint-disable-next-line @typescript-eslint/no-base-to-string, @typescript-eslint/restrict-template-expressions
          message: `${{ names }} here`,
        });

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      testID="avatar-stack-pin"
      style={[styles.stack, selected ? styles.selected : null]}
    >
      {visible.map((member, index) => (
        <View
          key={member.id}
          testID={`avatar-stack-pin-avatar-${member.id}`}
          style={[
            styles.avatar,
            { marginLeft: index === 0 ? 0 : -8, zIndex: visible.length - index },
          ]}
        >
          <Text style={styles.avatarInitial}>{member.initial}</Text>
        </View>
      ))}
      {overflow > 0 ? (
        <View
          testID="avatar-stack-pin-overflow"
          style={[styles.avatar, styles.overflow, { marginLeft: -8 }]}
        >
          <Text style={styles.avatarInitial}>{`+${String(overflow)}`}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 4,
    borderRadius: 999,
    backgroundColor: tokens.color.ink[800],
    borderWidth: 1,
    borderColor: tokens.color.ink[600],
  },
  selected: {
    borderColor: tokens.color.yellow,
    borderWidth: 2,
    transform: [{ scale: 1.15 }],
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: tokens.color.blue,
    borderWidth: 1.5,
    borderColor: tokens.color.ink[900],
    alignItems: 'center',
    justifyContent: 'center',
  },
  overflow: {
    backgroundColor: tokens.color.ink[600],
  },
  avatarInitial: {
    color: tokens.color.paper.bright,
    fontSize: tokens.type.label.fontSize,
    fontWeight: '600',
  },
});
