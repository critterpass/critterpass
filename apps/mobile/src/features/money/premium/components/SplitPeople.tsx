/**
 * Who shares an expense, under the split switch (7.18). Evenly: the crew's avatars, each one in or
 * out at a tap. By share: a stepper per person. Custom: each person's amount; tapping one points
 * the number pad at it, and what is left to assign shows above.
 */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { crewAccent } from '@/features/trip';
import { useLocale } from '@/lib/i18n/use-locale';
import { Avatar, PressableScale, ring, Stepper, Text, usePremiumTheme } from '@/ui/premium';

import type { MoneyMember } from '../../data/context';
import { fixedMinorOf, leftToAssign, weightOf, type ExpenseDraft } from '../../add-expense/draft';
import { formatAmount } from '../../format';

export interface SplitPeopleProps {
  readonly draft: ExpenseDraft;
  readonly members: readonly MoneyMember[];
  readonly perMember: ReadonlyMap<string, bigint> | null;
  readonly onToggle: (userId: string) => void;
  readonly onStep: (userId: string, delta: 1 | -1) => void;
  readonly onFocus: (userId: string | null) => void;
}

export function SplitPeople(props: SplitPeopleProps) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const { draft, members } = props;
  if (draft.mode === 'equal') {
    return (
      <View
        style={[
          styles.wrap,
          {
            gap: th.space.gap10,
            paddingHorizontal: th.space.gutter,
            paddingTop: th.space.gap4,
          },
        ]}
      >
        {members.map((member) => {
          const inSplit = draft.included.includes(member.userId);
          return (
            <PressableScale
              key={member.userId}
              onPress={() => props.onToggle(member.userId)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: inSplit }}
              accessibilityLabel={member.name}
              testID={`money-split-toggle-${member.userId}`}
            >
              <View style={[styles.person, inSplit ? null : styles.out]}>
                <Avatar
                  name={member.name}
                  color={crewAccent(member.joinIndex)}
                  uid={member.userId}
                  size={36}
                />
                <Text variant="badge" tone="inkSecondary" numberOfLines={1}>
                  {member.name}
                </Text>
              </View>
            </PressableScale>
          );
        })}
      </View>
    );
  }
  const left = draft.mode === 'fixed' ? leftToAssign(draft) : 0n;
  return (
    <View
      style={[
        styles.card,
        {
          marginHorizontal: th.space.gutter,
          borderRadius: th.radius.card,
          backgroundColor: th.color.card,
          boxShadow: th.shadow.card,
        },
      ]}
    >
      {draft.mode === 'fixed' ? (
        <Text
          variant="helper"
          color={left === 0n ? th.color.status.booked.text : th.color.status.tangerine.text}
          style={styles.left}
          testID="money-split-left"
        >
          {left === 0n
            ? t({ id: 'money.premium.allAssigned', message: 'All of it is assigned' })
            : t({
                id: 'money.premium.leftToAssign',
                message: `${formatAmount(left, draft.currency, locale)} left to assign`,
              })}
        </Text>
      ) : null}
      {members.map((member, index) => {
        const focused = draft.focus === member.userId;
        const share = props.perMember?.get(member.userId) ?? null;
        return (
          <View
            key={member.userId}
            style={[
              styles.row,
              index === 0 ? null : { borderTopWidth: 0.5, borderTopColor: th.color.hairline },
            ]}
          >
            <Avatar
              name={member.name}
              color={crewAccent(member.joinIndex)}
              uid={member.userId}
              size={28}
            />
            <View style={styles.flex}>
              <Text variant="rowTextStrong" numberOfLines={1}>
                {member.name}
              </Text>
              {share === null ? null : (
                <Text variant="captionMuted" tone="muted">
                  {formatAmount(share, draft.currency, locale)}
                </Text>
              )}
            </View>
            {draft.mode === 'weights' ? (
              <Stepper
                value={weightOf(draft, member.userId)}
                min={0}
                max={20}
                onChange={(next) =>
                  props.onStep(member.userId, next > weightOf(draft, member.userId) ? 1 : -1)
                }
                accessibilityLabel={t({
                  id: 'money.premium.sharesOf',
                  message: `${member.name}'s shares`,
                })}
                testID={`money-split-weight-${member.userId}`}
              />
            ) : (
              <PressableScale
                onPress={() => props.onFocus(focused ? null : member.userId)}
                accessibilityRole="button"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={t({
                  id: 'money.premium.amountOf',
                  message: `${member.name}'s amount`,
                })}
                testID={`money-split-fixed-${member.userId}`}
              >
                <View
                  style={[
                    styles.fixed,
                    {
                      borderRadius: th.radius.field,
                      backgroundColor: focused ? th.color.card : th.color.control,
                    },
                    focused ? { boxShadow: ring(2, th.color.ink) } : null,
                  ]}
                >
                  <Text variant="headline" style={styles.tabular}>
                    {formatAmount(fixedMinorOf(draft, member.userId), draft.currency, locale)}
                  </Text>
                </View>
              </PressableScale>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // Centred under the split switch, so one person in the split never strands at the left edge.
  wrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  person: { alignItems: 'center', gap: 4, width: 52 },
  out: { opacity: 0.4 },
  card: { overflow: 'hidden' },
  left: { paddingHorizontal: 14, paddingTop: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  flex: { flex: 1, minWidth: 0 },
  fixed: {
    minWidth: 96,
    height: 40,
    paddingHorizontal: 12,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  tabular: { fontVariant: ['tabular-nums'] },
});
