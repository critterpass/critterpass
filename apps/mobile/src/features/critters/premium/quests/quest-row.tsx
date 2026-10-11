/**
 * One crew quest (8.07): a row with its accent sticker, title, line, progress bar and reward; the
 * featured one (an optional quest to join, or the one with a legendary reward) as a sun-ringed card
 * with the crew's squad (joined members ringed in mint, the rest faded) and its reward tile. Joining
 * signs you up and the crew sees it; a befriend quest says where and how; a phrase quest offers
 * practice. A finished quest's reward lands with a pop.
 */
import { format } from '@cp/i18n';
import { t } from '@lingui/core/macro';
import { Linking, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { Doodle, crewAccent, type DoodleName } from '@/features/crew';
import { currentFormats } from '@/lib/i18n/formats';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  Avatar,
  Button,
  CritterSticker,
  Text,
  makePremiumStyles,
  usePremiumReducedMotion,
  usePremiumTheme,
  type PremiumTheme,
} from '@/ui/premium';

import { directionsUrl } from '../../quests/befriend-spot';
import type { QuestCardModel, QuestColour, QuestIcon } from '../../quests/quests-model';
import type { BefriendPlace } from '../../quests/use-befriend-spot';
import type { RevealMode } from '../../quests/use-reward-reveal';
import { CritterSilhouette } from '../components/critter-silhouette';
import { doubleRing, ring } from '../components/scrims';

const DOODLE: Record<QuestIcon, DoodleName> = {
  sun: 'star',
  pin: 'pin',
  food: 'food',
  wallet: 'wallet',
  egg: 'spark',
  star: 'star',
  critter: 'heart',
};

export function questAccent(th: PremiumTheme, colour: QuestColour): string {
  switch (colour) {
    case 'yellow':
      return th.accent.sun;
    case 'pink':
      return th.accent.pink;
    case 'green':
      return th.accent.mint;
    case 'blue':
      return th.accent.sky;
  }
}

const useStyles = makePremiumStyles((th) => ({
  row: {
    padding: 12,
    paddingHorizontal: 14,
    gap: th.space.gap10,
    borderRadius: 22,
    backgroundColor: th.color.card,
    boxShadow: th.shadow.card,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: th.space.gap12 },
  track: { height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: th.color.control },
  squad: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  tile: {
    width: 74,
    height: 84,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: th.color.status.maybe.bg,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: th.space.gap8 },
}));

function rewardLine(card: QuestCardModel, done: boolean): string {
  const reward =
    card.reward.kind === 'critter'
      ? t({ id: 'quests.reward.critter', message: 'Reward · legendary critter' })
      : card.reward.kind === 'settled'
        ? t({ id: 'quests.reward.settled', message: 'Reward · Settled Tokek' })
        : t({ id: 'quests.reward.xp', message: `Reward · +${card.reward.xp} XP` });
  if (done) return `${reward} · ${t({ id: 'quests.card.done', message: 'Done' })}`;
  if (card.state === 'missed')
    return `${reward} · ${t({ id: 'quests.card.missed', message: 'Missed' })}`;
  return reward;
}

function Befriend({ id, place }: { readonly id: string; readonly place: BefriendPlace }) {
  const locale = useLocale();
  const how = t({
    id: 'quests.befriend.how',
    message: 'Stay about 5 minutes nearby with CritterPass open.',
  });
  const { spot } = place;
  if (spot === null) {
    return (
      <Text variant="captionMuted" tone="muted" testID={`quest-befriend-how-${id}`}>
        {how}
      </Text>
    );
  }
  const name = spot.name;
  const unit = currentFormats().distance === 'mi' ? 'imperial' : 'metric';
  const away = spot.distanceM === null ? null : format.distance(locale, spot.distanceM, unit);
  return (
    <View style={{ gap: 6 }} testID={`quest-befriend-${id}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text variant="rowText" style={{ flex: 1 }} testID={`quest-befriend-spot-${id}`}>
          {away === null
            ? t({ id: 'quests.befriend.nearest', message: `Nearest: ${name}` })
            : t({ id: 'quests.befriend.nearestAway', message: `Nearest: ${name} · ${away}` })}
        </Text>
        <Button
          size="small"
          variant="control"
          label={t({ id: 'quests.befriend.go', message: 'Go' })}
          onPress={() => void Linking.openURL(directionsUrl(spot)).catch(() => false)}
          testID={`quest-befriend-go-${id}`}
        />
      </View>
      <Text variant="captionMuted" tone="muted" testID={`quest-befriend-how-${id}`}>
        {how}
      </Text>
    </View>
  );
}

export function QuestRow({
  card,
  featured,
  reveal,
  befriendPlace,
  onSignUp,
  onPractise,
}: {
  readonly card: QuestCardModel;
  readonly featured: boolean;
  readonly reveal?: RevealMode;
  readonly befriendPlace?: BefriendPlace | undefined;
  readonly onSignUp: (id: string) => void;
  readonly onPractise?: ((language: string | null) => void) | undefined;
}) {
  const th = usePremiumTheme();
  const styles = useStyles();
  const reduced = usePremiumReducedMotion();
  const accent = questAccent(th, card.colour);
  const done = card.state === 'done' || reveal !== undefined;
  const progress =
    card.progress === null
      ? null
      : done
        ? 1
        : card.progress.done / Math.max(1, card.progress.total);
  const active = card.state === 'active' && !done;
  const practice = card.practice;
  return (
    <View
      style={[
        styles.row,
        featured ? { borderRadius: 24, boxShadow: ring(2, th.accent.sun) } : null,
        card.state === 'missed' ? { opacity: 0.55 } : null,
      ]}
      testID={`quest-card-${card.id}`}
    >
      <View style={styles.head}>
        {featured ? null : <Doodle name={DOODLE[card.icon]} color={accent} size={44} />}
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant={featured ? 'headline' : 'rowTitle'}>{card.title}</Text>
          <Text variant="captionMuted" tone="muted">
            {card.body}
          </Text>
        </View>
        {featured && card.reward.kind === 'critter' ? (
          <View style={styles.tile}>
            <CritterSilhouette kind="gecko" label={card.title} size={54} rarity="legendary" />
            <Text variant="statLabel" color={th.color.status.maybe.text}>
              {t({ id: 'critters.premium.quests.legendary', message: 'LEGENDARY' })}
            </Text>
          </View>
        ) : null}
      </View>
      {card.people === null ? null : (
        <View style={styles.squad}>
          {card.people.map((person) => (
            <View
              key={person.userId}
              style={[
                { borderRadius: 14 },
                person.done || done
                  ? { boxShadow: doubleRing(2, th.color.card, 3.5, th.accent.mint) }
                  : { opacity: 0.35 },
              ]}
            >
              <Avatar name={person.name} color={crewAccent(null, person.joinIndex)} size={24} />
            </View>
          ))}
        </View>
      )}
      {progress === null ? null : (
        <View style={styles.track}>
          <View
            style={{ width: `${Math.round(progress * 100)}%`, height: 5, backgroundColor: accent }}
          />
        </View>
      )}
      <Animated.View
        key={done ? 'done' : 'open'}
        entering={
          done && reveal !== undefined
            ? reduced
              ? FadeIn.duration(150)
              : ZoomIn.springify()
            : undefined
        }
      >
        <Text variant="badge" tone="muted">
          {rewardLine(card, done)}
        </Text>
      </Animated.View>
      {card.befriend !== null && active && befriendPlace !== undefined ? (
        <Befriend id={card.id} place={befriendPlace} />
      ) : null}
      <View style={styles.actions}>
        {practice !== null && active && onPractise !== undefined ? (
          <Button
            size="small"
            variant="control"
            label={t({ id: 'quests.card.practise', message: 'Practise' })}
            onPress={() => onPractise(practice.language)}
            testID={`quest-practise-${card.id}`}
          />
        ) : null}
        {card.optional && card.state === 'active' ? (
          card.signedUp ? (
            <Text
              variant="badge"
              color={th.color.status.booked.text}
              testID={`quest-joined-${card.id}`}
            >
              {t({ id: 'quests.card.joined', message: "You're in" })}
            </Text>
          ) : (
            <Button
              size="small"
              label={t({ id: 'quests.card.join', message: "I'm in" })}
              onPress={() => onSignUp(card.id)}
              testID={`quest-join-${card.id}`}
            />
          )
        ) : null}
      </View>
    </View>
  );
}

/** The guide's art for the empty states and the level-up toast. */
export function GuideArt({ kind, name }: { readonly kind: string; readonly name: string }) {
  return <CritterSticker kind={kind} name={name} size={96} pose="think" />;
}
