/**
 * WHO'S GOING on Add to plan (7f-1): the crew's faces and "Everyone ›", which opens the list under
 * it (undesigned: one row per member with a tick, built from the planning kit's pieces) so someone
 * can be left out; the stop then carries just the people still ticked.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { Icon } from '@/ui/icons/Icon';
import { AvatarStack, type StackMember } from '@/ui/people/AvatarStack';
import { PressScale } from '@/ui/press/PressScale';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: t.space['12'] },
  faces: { flex: 1, minWidth: 0 },
  list: {
    marginTop: t.space['8'],
    borderRadius: t.radius.md,
    backgroundColor: t.semantic.bg.raised,
  },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['12'],
    minHeight: 44,
    paddingHorizontal: t.space['14'],
  },
  name: { flex: 1, minWidth: 0 },
}));

export interface WhoGoingProps {
  readonly members: readonly StackMember[];
  /** Who is left out (empty: everyone goes). */
  readonly out: ReadonlySet<string>;
  readonly open: boolean;
  readonly onOpen: () => void;
  readonly onToggle: (uid: string) => void;
}

export function WhoGoing({ members, out, open, onOpen, onToggle }: WhoGoingProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  const going = members.filter((member) => !out.has(member.key));
  const count = going.length;
  const summary =
    out.size === 0
      ? t({ id: 'plan.add.who.everyone', message: 'Everyone ›' })
      : t({ id: 'plan.add.who.some', message: `${count} going ›` });
  return (
    <View testID="plan-add-who">
      <View style={styles.row}>
        <Text variant="eyebrow" color={theme.semantic.text.secondary}>
          {t({ id: 'plan.add.who.title', message: 'WHO’S GOING' })}
        </Text>
        <View style={styles.faces}>
          <AvatarStack members={going} size="sm" max={6} />
        </View>
        <PressScale
          widthClass="narrow"
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={summary}
          onPress={onOpen}
          testID="plan-add-who-open"
        >
          <Text variant="label" color={theme.semantic.action.primary}>
            {summary}
          </Text>
        </PressScale>
      </View>
      {open ? (
        <View style={styles.list}>
          {members.map((member) => {
            const ticked = !out.has(member.key);
            return (
              <PressScale
                key={member.key}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: ticked }}
                accessibilityLabel={member.name}
                onPress={() => onToggle(member.key)}
                testID={`plan-add-who-${member.key}`}
              >
                <View style={styles.member}>
                  <AvatarStack members={[member]} size="sm" max={1} />
                  <Text variant="body" style={styles.name} numberOfLines={1}>
                    {member.name}
                  </Text>
                  {ticked ? (
                    <Icon name="check" size={18} color={theme.semantic.state.success} decorative />
                  ) : null}
                </View>
              </PressScale>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
