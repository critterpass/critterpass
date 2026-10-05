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
  link: { minHeight: 44, justifyContent: 'center' },
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
  // A trip of one: nobody to choose among, so no list to open.
  const solo = members.length <= 1;
  const summary = solo
    ? t({ id: 'plan.add.who.justYou', message: 'Just you' })
    : out.size === 0
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
        {solo ? (
          <Text variant="body" singleLine testID="plan-add-who-solo">
            {summary}
          </Text>
        ) : (
          <PressScale
            widthClass="narrow"
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            accessibilityLabel={summary}
            onPress={onOpen}
            style={styles.link}
            testID="plan-add-who-open"
          >
            <Text variant="body" color={theme.semantic.action.primary} singleLine>
              {summary}
            </Text>
          </PressScale>
        )}
      </View>
      {open && !solo ? (
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

/** The people left out after a tap on `uid`: at least one person always goes. */
export function toggledOut(
  out: ReadonlySet<string>,
  uid: string,
  everyone: number,
): ReadonlySet<string> {
  const next = new Set(out);
  if (next.has(uid)) next.delete(uid);
  else if (next.size < everyone - 1) next.add(uid);
  return next;
}
