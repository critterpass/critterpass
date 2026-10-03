/**
 * One option in a live decision (3g-2): a photo strip (hatched until the place has a photo), the
 * name, a detail line, and who voted as avatar stickers with the count. The leader fills blue with
 * a yellow ring and the LEADING tag (which hops over when the lead changes); my vote lands with a
 * pop and a "+1" that floats off; friends browsing it show their name tag. Tapping votes.
 */
import { useLingui } from '@lingui/react/macro';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { resolveMemberStyle, tokens } from '@cp/design-tokens';
import { upper } from '@cp/i18n';

import { useSquash } from '@/motion/patterns/squash';
import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { useLocale } from '@/lib/i18n/use-locale';
import { Row } from '@/ui/layout/Row';
import { AvatarStack } from '@/ui/people/AvatarStack';
import { PressScale } from '@/ui/press/PressScale';
import { Text } from '@/ui/text/Text';
import { Hatch } from '@/ui/textures/hatch';
import { makeStyles, useTheme } from '@/ui/theme';

import { money } from '../day/format';
import type { DecisionOption } from './decision-model';
import { type PlanMember } from '@/data/plan/use-trip-plan';

const FLOAT_PT = 28;
const POP_SCALE = 1.15;

const useStyles = makeStyles((th) => ({
  card: { borderRadius: th.radius.lg, overflow: 'hidden', backgroundColor: th.semantic.bg.raised },
  leader: {
    backgroundColor: th.color.blue,
    borderWidth: th.space['4'] - 1,
    borderColor: th.color.yellow,
  },
  photo: { height: th.space['32'] * 3, justifyContent: 'flex-end', padding: th.space['10'] },
  body: { padding: th.space['12'], gap: th.space['4'] },
  tag: {
    position: 'absolute',
    top: th.space['10'],
    end: th.space['10'],
    borderRadius: th.radius.sm,
    paddingHorizontal: th.space['8'],
    paddingVertical: th.space['2'],
    backgroundColor: th.color.yellow,
  },
  cursor: {
    position: 'absolute',
    top: th.space['32'] * 3 + th.space['4'],
    end: th.space['12'],
    borderRadius: th.radius.pill,
    paddingHorizontal: th.space['8'],
    paddingVertical: th.space['2'],
  },
  float: { position: 'absolute', end: th.space['16'], bottom: th.space['32'] },
}));

function LeadingTag() {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const hop = useSquash({ active: true });
  return (
    <Animated.View style={[styles.tag, hop]} testID="plan-decide-leading">
      <Text variant="label" color={theme.semantic.text.onAccent}>
        {upper(t({ id: 'plan.collab.leading', message: 'Leading' }), locale)}
      </Text>
    </Animated.View>
  );
}

/** A vote landing: the voters pop (1 → 1.15 → 1); still under reduced motion. */
function usePop(token: number) {
  const reduced = useReducedImpactMotion();
  const scale = useSharedValue(1);
  useEffect(() => {
    if (token === 0 || reduced) return;
    scale.value = withSequence(
      withTiming(POP_SCALE, { duration: tokens.motion.duration.instant }),
      withTiming(1, { duration: tokens.motion.duration.fast }),
    );
  }, [token, reduced, scale]);
  return useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
}

/** "+1" rising off a card when my vote lands on it. */
function PlusOneFloat({ token }: { readonly token: number }) {
  const styles = useStyles();
  const theme = useTheme();
  const reduced = useReducedImpactMotion();
  const y = useSharedValue(0);
  const opacity = useSharedValue(0);
  useEffect(() => {
    if (token === 0 || reduced) return;
    y.value = 0;
    y.value = withTiming(-FLOAT_PT, { duration: tokens.motion.duration.slow });
    opacity.value = withSequence(
      withTiming(1, { duration: tokens.motion.duration.instant }),
      withTiming(0, { duration: tokens.motion.duration.medium }),
    );
  }, [token, reduced, y, opacity]);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: y.value }],
  }));
  return (
    <Animated.View style={[styles.float, style]} pointerEvents="none">
      <Text variant="h3" color={theme.color.yellow}>
        +1
      </Text>
    </Animated.View>
  );
}

export function OptionCard({
  option,
  members,
  leading,
  winner,
  browsing,
  voteToken,
  disabled,
  onVote,
}: {
  readonly option: DecisionOption;
  readonly members: readonly PlanMember[];
  readonly leading: boolean;
  readonly winner: boolean;
  /** Friends looking at this option right now. */
  readonly browsing: readonly PlanMember[];
  /** Bumps when my vote lands here. */
  readonly voteToken: number;
  readonly disabled: boolean;
  readonly onVote: () => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const pop = usePop(voteToken);
  const voters = option.voters.flatMap((uid) => {
    const member = members.find((candidate) => candidate.uid === uid);
    return member === undefined
      ? []
      : [{ key: uid, name: member.name, joinIndex: member.joinIndex }];
  });
  const price =
    option.amountMinor === null || option.currency === null
      ? null
      : money(locale, option.amountMinor, option.currency);
  const detail = [option.detail, price].filter(Boolean).join(' · ');
  const onColor = leading || winner ? theme.semantic.text.onAccent : theme.semantic.text.primary;
  const count = option.voters.length;
  return (
    <PressScale
      widthClass="medium"
      onPress={onVote}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={[
        option.title,
        detail,
        t({ id: 'plan.collab.votes', message: `${count} votes` }),
        leading ? t({ id: 'plan.collab.leading', message: 'Leading' }) : null,
        winner ? t({ id: 'plan.collab.picked', message: 'Picked' }) : null,
      ]
        .filter(Boolean)
        .join(', ')}
      accessibilityState={{ selected: option.mine, disabled }}
      style={[styles.card, leading || winner ? styles.leader : null, { flex: 1 }]}
      testID={`plan-decide-option-${option.id}`}
    >
      <View style={styles.photo}>
        <Hatch />
        <Text variant="monoData" color={onColor}>
          {t({ id: 'plan.collab.photo', message: `photo · ${option.title}` })}
        </Text>
      </View>
      <View style={styles.body}>
        <Text variant="title" color={onColor} numberOfLines={2}>
          {upper(option.title, locale)}
        </Text>
        {detail === '' ? null : (
          <Text variant="bodySm" color={onColor} numberOfLines={1}>
            {detail}
          </Text>
        )}
        <Row gap="6" align="center">
          <Animated.View style={pop}>
            {voters.length > 0 ? <AvatarStack members={voters} size="sm" max={5} /> : null}
          </Animated.View>
          <Text variant="label" color={onColor}>
            {String(count)}
          </Text>
        </Row>
      </View>
      {leading || winner ? (
        winner ? (
          <View style={styles.tag}>
            <Text variant="label" color={theme.semantic.text.onAccent}>
              {upper(t({ id: 'plan.collab.picked', message: 'Picked' }), locale)}
            </Text>
          </View>
        ) : (
          <LeadingTag key={option.id} />
        )
      ) : null}
      {browsing.map((member, index) => (
        <View
          key={member.uid}
          style={[
            styles.cursor,
            {
              backgroundColor: resolveMemberStyle(member.joinIndex).color,
              marginTop: index * theme.space['24'],
            },
          ]}
          pointerEvents="none"
        >
          <Text variant="label" color={theme.semantic.text.onAccent}>
            {upper(member.name, locale)}
          </Text>
        </View>
      ))}
      <PlusOneFloat token={voteToken} />
    </PressScale>
  );
}
