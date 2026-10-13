/**
 * One option of a live decision in the premium look (undesigned; built from the card, crew stack
 * and number roll): the name and its detail, who voted and the count rolling as it changes. The
 * leader wears an ink ring and "Leading", the pick "Picked"; my vote lands with a press and a pop;
 * friends looking at it are named under it. Tapping votes.
 */
import { useLingui } from '@lingui/react/macro';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';

import type { PlanMember } from '@/data/plan/use-trip-plan';
import { crewColour } from '@/features/vote';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  Card,
  CrewStack,
  NumberRoll,
  PressableScale,
  SPRINGS,
  StatusTag,
  Text,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';

import type { DecisionOption } from '../../collab/decision-model';
import { money } from '../../day/format';

/** The ink ring around the leading option. */
function ringShadow(colour: string): string {
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a style value, never copy.
  return `0 0 0 2px ${colour}`;
}

export function PremiumOptionRow(props: {
  readonly option: DecisionOption;
  readonly members: readonly PlanMember[];
  readonly leading: boolean;
  readonly winner: boolean;
  readonly browsing: readonly PlanMember[];
  /** Counts my taps: each one pops the card. */
  readonly voteToken: number;
  readonly disabled: boolean;
  readonly onVote: () => void;
}) {
  const { option } = props;
  const { t } = useLingui();
  const locale = useLocale();
  const theme = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const pop = useSharedValue(1);
  useEffect(() => {
    if (props.voteToken === 0 || reduced) return;
    pop.set(withSequence(withSpring(1.04, SPRINGS.lively), withSpring(1, SPRINGS.snappy)));
  }, [props.voteToken, reduced, pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const voters = option.voters.flatMap((uid) => {
    const member = props.members.find((m) => m.uid === uid);
    return member === undefined
      ? []
      : [{ id: uid, name: member.name, color: crewColour(member.joinIndex) }];
  });
  const price =
    option.amountMinor === null || option.currency === null
      ? null
      : money(locale, option.amountMinor, option.currency);
  const detail = [option.detail, price].filter((part) => part !== null && part !== '').join(' · ');
  const lookers = props.browsing.map((member) => member.name).filter((name) => name !== '');
  const ring = props.leading || props.winner;
  return (
    <Animated.View style={popStyle}>
      <PressableScale
        onPress={props.onVote}
        disabled={props.disabled}
        accessibilityRole="button"
        accessibilityState={{ selected: option.mine, disabled: props.disabled }}
        accessibilityLabel={t({
          id: 'plan.premium.decide.vote',
          message: `${option.title}, ${option.voters.length} votes`,
        })}
        testID={`plan-option-${option.id}`}
      >
        <Card
          style={ring ? { boxShadow: ringShadow(theme.color.ink) } : undefined}
          testID={option.mine ? 'plan-option-mine' : undefined}
        >
          <View style={styles.row}>
            <View style={styles.grow}>
              <Text variant="rowTitle" numberOfLines={2}>
                {option.title}
              </Text>
              {detail === '' ? null : (
                <Text variant="rowText" tone="muted" numberOfLines={2}>
                  {detail}
                </Text>
              )}
            </View>
            <NumberRoll text={String(option.voters.length)} variant="stat" />
          </View>
          <View style={styles.foot}>
            {voters.length === 0 ? (
              <Text variant="caption" tone="muted">
                {t({ id: 'plan.premium.decide.noVotes', message: 'No votes yet' })}
              </Text>
            ) : (
              <CrewStack
                members={voters}
                size={24}
                max={5}
                accessibilityLabel={voters.map((voter) => voter.name).join(', ')}
              />
            )}
            {props.winner ? (
              <StatusTag
                label={t({ id: 'plan.premium.decide.picked', message: 'Picked' })}
                tone="booked"
              />
            ) : props.leading ? (
              <StatusTag
                label={t({ id: 'plan.premium.decide.leading', message: 'Leading' })}
                tone="voteOpen"
              />
            ) : null}
          </View>
          {lookers.length === 0 ? null : (
            <Text variant="caption" tone="muted" testID={`plan-option-browsing-${option.id}`}>
              {t({
                id: 'plan.premium.decide.looking',
                message: `${lookers.join(', ')} looking`,
              })}
            </Text>
          )}
        </Card>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1, gap: 2 },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    minHeight: 24,
  },
});
