/**
 * One quest card of 3l-7: the library `QuestCard` in the quest's colour with its pips (or faces for
 * an all-hands quest), the reward line and the reward art, which spins onto the card at the shared
 * reveal moment. A finished quest reads DONE, a missed one MISSED and dims; an optional quest
 * offers I'M IN until the traveller joins. An active phrase quest offers PRACTISE, which opens
 * phrase practice in the quest's language (an undesigned control, logged in
 * docs/undesigned-states.md).
 */
import { tokens } from '@cp/design-tokens';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { QuestCard } from '@/ui/critters/QuestCard';
import { Icon } from '@/ui/icons/Icon';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Avatar } from '@/ui/people/Avatar';
import { EmptySeat } from '@/ui/people/EmptySeat';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { BefriendWhere } from './befriend-where';
import type { QuestCardModel } from './quests-model';
import type { BefriendPlace } from './use-befriend-spot';
import type { RevealMode } from './use-reward-reveal';

/** The reward doodle's size in the design, and the locked legendary's. */
const ART = 44;
const LOCKED_ART = 72;

/** The quest colours in their design order. */
export function questColour(theme: ReturnType<typeof useTheme>, colour: QuestCardModel['colour']) {
  switch (colour) {
    case 'yellow':
      return theme.color.yellow;
    case 'pink':
      return theme.color.pink;
    case 'green':
      return theme.color.green.base;
    case 'blue':
      return theme.color.blue;
  }
}

const useStyles = makeStyles(() => ({
  locked: { width: LOCKED_ART, height: LOCKED_ART, alignItems: 'center', justifyContent: 'center' },
  mark: { position: 'absolute' },
  missed: { opacity: 0.55 },
}));

/** The guide who wrote the quests, as the locked-critter art's silhouette. */
export interface QuestGuideArt {
  readonly kind: string;
  readonly name: string;
}

/** A legendary still to earn: the gold silhouette with a yellow "?". */
function LockedLegendary({ guide }: { readonly guide: QuestGuideArt }) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.locked}>
      <Sticker
        kind={guide.kind}
        name={guide.name}
        size={LOCKED_ART}
        variant="mask"
        maskColor={theme.tier.locked.legendary.silhouette}
        sticker={null}
      />
      <Text variant="h3" designSize={26} style={styles.mark} color={theme.tier.legendary.color}>
        ?
      </Text>
    </View>
  );
}

function RewardArt({
  card,
  guide,
  reveal,
}: {
  readonly card: QuestCardModel;
  readonly guide: QuestGuideArt;
  readonly reveal?: RevealMode;
}) {
  const theme = useTheme();
  const turn = useSharedValue(0);
  const scale = useSharedValue(1);
  useEffect(() => {
    if (reveal !== 'spin') return;
    turn.value = withTiming(1, { duration: tokens.motion.duration.slow });
    scale.value = withSequence(
      withTiming(1.35, { duration: tokens.motion.duration.fast }),
      withSpring(1),
    );
  }, [reveal, turn, scale]);
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${turn.value * 720}deg` }, { scale: scale.value }],
  }));
  const colour = questColour(theme, card.colour);
  return (
    <Animated.View style={style} testID={`quest-reward-art-${card.id}`}>
      {card.icon === 'critter' ? (
        <LockedLegendary guide={guide} />
      ) : (
        <Icon
          name={card.icon}
          size={ART}
          decorative
          color={theme.semantic.text.primary}
          accent={colour}
        />
      )}
    </Animated.View>
  );
}

function People({ card }: { readonly card: QuestCardModel }) {
  if (card.people === null) return null;
  return (
    <Row gap="6" wrap testID={`quest-people-${card.id}`}>
      {card.people.map((person) =>
        person.done ? (
          <Avatar key={person.userId} name={person.name} joinIndex={person.joinIndex} size="sm" />
        ) : (
          <EmptySeat key={person.userId} size={26} label={person.name} />
        ),
      )}
    </Row>
  );
}

export function QuestCardView({
  card,
  guide,
  reveal,
  befriendPlace,
  onSignUp,
  onPractise,
}: {
  readonly card: QuestCardModel;
  readonly guide: QuestGuideArt;
  readonly reveal?: RevealMode;
  /** Where a "befriend" quest can be done, for an active one. */
  readonly befriendPlace?: BefriendPlace | undefined;
  readonly onSignUp: (id: string) => void;
  /** Opens phrase practice in the given language; absent while practice is not offered. */
  readonly onPractise?: ((language: string | null) => void) | undefined;
}) {
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const done = card.state === 'done' || reveal !== undefined;
  const reward =
    card.reward.kind === 'critter'
      ? t({ id: 'quests.reward.critter', message: 'Reward · legendary critter' })
      : card.reward.kind === 'settled'
        ? t({ id: 'quests.reward.settled', message: 'Reward · Settled Tokek' })
        : t({ id: 'quests.reward.xp', message: `Reward · +${card.reward.xp} XP` });
  const status = done
    ? t({ id: 'quests.card.done', message: 'Done ✓' })
    : card.state === 'missed'
      ? t({ id: 'quests.card.missed', message: 'Missed' })
      : null;
  const styles = useStyles();
  const shown =
    done && card.people !== null
      ? { ...card, people: card.people.map((person) => ({ ...person, done: true })) }
      : card;
  const progress =
    card.progress === null
      ? undefined
      : done
        ? { done: card.progress.total, total: card.progress.total }
        : card.progress;
  const join =
    card.optional && card.state === 'active' ? (
      card.signedUp ? (
        <Text
          variant="label"
          color={theme.semantic.state.success}
          testID={`quest-joined-${card.id}`}
        >
          {upper(t({ id: 'quests.card.joined', message: "You're in" }), locale)}
        </Text>
      ) : (
        <PillButton
          label={t({ id: 'quests.card.join', message: "I'm in" })}
          size="sm"
          onPress={() => onSignUp(card.id)}
          testID={`quest-join-${card.id}`}
        />
      )
    ) : undefined;
  const where =
    card.befriend !== null && card.state === 'active' && !done && befriendPlace !== undefined ? (
      <BefriendWhere id={card.id} place={befriendPlace} />
    ) : undefined;
  const practice = card.practice;
  const practise =
    practice !== null && card.state === 'active' && !done && onPractise !== undefined ? (
      <PillButton
        label={t({ id: 'quests.card.practise', message: 'Practise' })}
        size="sm"
        block={false}
        onPress={() => onPractise(practice.language)}
        testID={`quest-practise-${card.id}`}
      />
    ) : undefined;
  const parts = [where, practise, join].filter((part) => part !== undefined);
  const footer =
    parts.length === 0 ? undefined : parts.length === 1 ? (
      parts[0]
    ) : (
      <Stack gap="12">{parts}</Stack>
    );
  return (
    <View style={card.state === 'missed' ? styles.missed : null}>
      <QuestCard
        title={upper(card.title, locale)}
        description={card.body}
        color={questColour(theme, card.colour)}
        {...(progress === undefined ? {} : { progress })}
        people={<People card={shown} />}
        reward={upper(status === null ? reward : `${reward} · ${status}`, locale)}
        rewardSticker={
          <RewardArt card={card} guide={guide} {...(reveal === undefined ? {} : { reveal })} />
        }
        {...(footer === undefined ? {} : { footer })}
        testID={`quest-card-${card.id}`}
      />
    </View>
  );
}
