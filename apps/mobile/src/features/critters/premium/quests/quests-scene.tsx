/**
 * Crew quests (8.07), a push from the trip: the crew and its level over "Crew quests" with a star
 * sticker, the ink XP card (what the next sticker level unlocks), the featured quest ringed in sun,
 * then the day's other quests. Before day one, while the guide writes them and after the trip, an
 * empty state in the guide's voice. Offline, progress waits for signal.
 */
import { t } from '@lingui/core/macro';
import { router, Stack } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Doodle } from '@/features/crew';
import { guideSticker } from '@/ui/premium/stickers/guides';
import {
  EmptyState,
  GlassIconButton,
  OfflinePill,
  Skeleton,
  Text,
  makePremiumStyles,
  usePremiumTheme,
} from '@/ui/premium';

import type { QuestsViewProps } from '../../quests/quests-model';
import { SCRIM } from '../components/scrims';
import { QuestRow } from './quest-row';

const useStyles = makePremiumStyles((th) => ({
  xp: {
    marginTop: th.space.gap16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: th.space.gap8,
    borderRadius: 22,
    // The ink card in the light; in the dark the ink surface turns near-white, so the card stays a
    // raised dark card there (8.07 dark).
    ...(th.scheme === 'dark'
      ? { backgroundColor: th.color.card, boxShadow: th.shadow.card }
      : { backgroundColor: th.color.inkSurface }),
  },
  bar: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: th.scheme === 'dark' ? th.color.control : th.color.inkToastAction,
  },
}));

function emptyCopy(state: 'before' | 'writing' | 'over', name: string) {
  switch (state) {
    case 'writing':
      return {
        title: t({ id: 'quests.empty.writingTitle', message: "Writing today's quests" }),
        line: t({
          id: 'quests.empty.writingLine',
          message: `${name} writes them from your plan every morning. They'll be here soon.`,
        }),
      };
    case 'before':
      return {
        title: t({ id: 'quests.empty.beforeTitle', message: 'Quests start on day one' }),
        line: t({
          id: 'quests.empty.beforeLine',
          message: `${name} writes the crew's first quests the morning your trip starts.`,
        }),
      };
    case 'over':
      return {
        title: t({ id: 'quests.empty.overTitle', message: "That's a wrap" }),
        line: t({
          id: 'quests.empty.overLine',
          message: 'No more quests on this trip. Your crew level and stickers stay on your pass.',
        }),
      };
  }
}

export function PremiumQuestsScene(props: QuestsViewProps) {
  const th = usePremiumTheme();
  // The words on the XP card: white on ink in the light, the card's ink in the dark.
  const xpInk = th.scheme === 'dark' ? th.color.ink : th.color.onInkSurface;
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const art = guideSticker(props.guide);
  const { model, crewName } = props;
  const level = model.level;
  const lvl = level.level;
  const next = level.nextStickerLevel;
  const eyebrow =
    crewName === ''
      ? t({ id: 'quests.header.levelOnly', message: `Crew level ${lvl}` })
      : t({ id: 'quests.header.eyebrow', message: `${crewName} · crew level ${lvl}` });
  const unlock = t({ id: 'quests.header.unlock', message: `Level ${next} unlocks a crew sticker` });
  const fraction = level.need > 0 ? Math.min(1, level.into / level.need) : 0;
  const featured =
    model.cards.find(
      (card) => card.state === 'active' && (card.optional || card.reward.kind === 'critter'),
    )?.id ?? null;
  return (
    <View style={{ flex: 1, backgroundColor: th.color.ground }} testID="quests-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 6,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 32,
        }}
      >
        <GlassIconButton
          icon="back"
          label={t({ id: 'quests.back', message: 'Trip' })}
          onPress={() => router.back()}
          testID="quests-back"
        />
        <View
          style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 12 }}
          testID="quests-header"
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="label" tone="muted">
              {eyebrow}
            </Text>
            <Text variant="largeTitle">{t({ id: 'quests.title', message: 'Crew quests' })}</Text>
          </View>
          <View style={{ transform: [{ rotate: `${STAR_TILT}deg` }] }}>
            <Doodle name="star" color={th.accent.sun} size={62} />
          </View>
        </View>
        <View
          style={styles.xp}
          accessible
          accessibilityLabel={t({
            id: 'critters.premium.quests.xpLabel',
            message: `${level.into} of ${level.need} XP. ${unlock}`,
          })}
        >
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
            <Text variant="stat" color={xpInk}>
              {String(level.into)}
            </Text>
            <Text variant="rowText" color={xpInk} style={{ opacity: 0.5 }}>
              {t({ id: 'critters.premium.quests.ofXp', message: `/ ${level.need} XP` })}
            </Text>
          </View>
          <Text variant="captionMuted" color={xpInk} style={{ opacity: 0.7 }}>
            {unlock}
          </Text>
          <View style={styles.bar}>
            <View
              style={{
                width: `${Math.round(fraction * 100)}%`,
                height: 10,
                borderRadius: 5,
                experimental_backgroundImage: SCRIM.xpFill,
              }}
            />
          </View>
        </View>
        {props.offline ? (
          <View style={{ marginTop: 12, gap: 6 }} testID="quests-offline">
            <OfflinePill />
            <Text variant="captionMuted" tone="muted">
              {t({
                id: 'quests.offline',
                message: "Progress and rewards land when you're back online.",
              })}
            </Text>
          </View>
        ) : null}
        <View style={{ marginTop: 16, gap: 10 }}>
          {model.state === 'loading' ? (
            <View testID="quests-loading" style={{ gap: 10 }}>
              <Skeleton height={120} radius={24} />
              <Skeleton height={88} radius={22} />
            </View>
          ) : model.state === 'ready' ? (
            <View style={{ gap: 10 }} testID="quests-list">
              {model.cards.map((card) => {
                const reveal = props.reveals.get(card.id);
                return (
                  <QuestRow
                    key={card.id}
                    card={card}
                    featured={card.id === featured}
                    {...(reveal === undefined ? {} : { reveal })}
                    befriendPlace={props.befriendPlace}
                    onSignUp={props.onSignUp}
                    onPractise={props.onPractise}
                  />
                );
              })}
            </View>
          ) : (
            <EmptyState
              {...emptyCopy(model.state, art.name)}
              critter={{ kind: art.kind, name: art.name }}
              testID={`quests-empty-${model.state}`}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

/** The star sticker's tilt, as drawn. */
const STAR_TILT = 10;
