/**
 * Nothing saved yet (7i-1): the trip map's sheet when the plan has no stops and the crew has saved
 * nothing, with the four ways to start. LET THE GUIDE DRAFT IT fills the days (the organiser's;
 * members are asked to nudge the organiser instead, undesigned); PASTE WHAT YOU SAVED, SWIPE
 * TOGETHER and COPY A CREW'S PLAN fill Ideas, each shown once its screen is registered. The guide
 * floats over the map where the stay will be.
 */
/* eslint-disable lingui/no-unlocalized-strings -- design ids and route params, never copy. */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useLocale } from '@/lib/i18n/use-locale';
import { useScreenHref } from '@/lib/navigation/screen-registry';
import { useLoop } from '@/motion/use-loop';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { Card } from '@/ui/cards/Card';
import { Icon } from '@/ui/icons/Icon';
import type { DoodleName } from '@/ui/icons/generated';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { planRoutes } from '../overview/routes';
import { tripDates } from './format';
import type { TripMapModel } from './sheet-props';
import { opener } from './use-ways-out';

const useStyles = makeStyles((t) => ({
  body: { gap: t.space['12'] },
  draftCard: { flexDirection: 'row', alignItems: 'center', gap: t.space['12'] },
  draftText: { flex: 1, minWidth: 0, gap: t.space['4'] },
  ways: { flexDirection: 'row', gap: t.space['8'] },
  way: { flex: 1, minHeight: 132 },
  wayBody: { gap: t.space['8'] },
}));

function Way({
  icon,
  title,
  caption,
  onPress,
  testID,
}: {
  readonly icon: DoodleName;
  readonly title: string;
  readonly caption: string;
  readonly onPress: () => void;
  readonly testID: string;
}) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.way}>
      <Card
        onPress={onPress}
        accessibilityLabel={`${title}, ${caption}`}
        testID={testID}
        style={{ flex: 1 }}
      >
        <View style={styles.wayBody}>
          <Icon name={icon} size={24} decorative />
          <Text variant="label">{title}</Text>
          <Text variant="caption" color={theme.semantic.text.secondary}>
            {caption}
          </Text>
        </View>
      </Card>
    </View>
  );
}

export function EmptyTripSheet({ model }: { readonly model: TripMapModel }) {
  const { t } = useLingui();
  const locale = useLocale();
  const styles = useStyles();
  const theme = useTheme();
  const tripId = model.tripId;
  const paste = opener(useScreenHref('7d-3', { tripId }));
  // Swipe together in a trip (7g-2) once it is registered, the earlier swipe until then.
  const swipeInTrip = useScreenHref('7g-2', { tripId, sessionId: 'new' });
  const swipeEarlier = useScreenHref('3d-2', { tripId, sessionId: 'new' });
  const swipe = opener(swipeInTrip ?? swipeEarlier);
  const copy = opener(useScreenHref('3o-1', { tripId, destination: model.destinationSlug ?? '' }));
  const going = model.members.length;
  const dates = tripDates(locale, model.startDate, model.endDate);
  const head = [
    model.destination ?? '',
    dates,
    t({ id: 'plan.tripMap.going', message: `${going} going` }),
  ]
    .filter((part) => part !== '')
    .join(' · ');
  const guide = model.guide.name;
  const organiser = model.organiser;
  return (
    <View style={styles.body} testID="trip-map-empty">
      <Text variant="eyebrow" color={theme.semantic.text.secondary}>
        {head}
      </Text>
      <Text variant="h1">
        {t({ id: 'plan.tripMap.empty.title', message: 'Nothing saved yet' })}
      </Text>
      <Text variant="body" color={theme.semantic.text.secondary}>
        {t({ id: 'plan.tripMap.empty.line', message: 'Four ways to start. Most crews mix two.' })}
      </Text>
      <Card
        tone="yellow"
        {...(organiser ? { onPress: () => router.push(planRoutes.setup(tripId)) } : {})}
        testID="trip-map-empty-draft"
      >
        <View style={styles.draftCard}>
          <View style={styles.draftText}>
            <Text variant="title" color={theme.color.paper.ink}>
              {organiser
                ? t({ id: 'plan.tripMap.empty.draft', message: `Let ${guide} draft it` })
                : t({
                    id: 'plan.tripMap.empty.askDraft',
                    message: `Ask your organiser to let ${guide} draft it`,
                  })}
            </Text>
            <Text variant="bodySm" color={theme.color.paper.ink}>
              {t({
                id: 'plan.tripMap.empty.draftLine',
                message: 'A day-by-day plan from your must-dos, in about a minute.',
              })}
            </Text>
          </View>
          {organiser ? (
            <Icon name="arrow" size={24} color={theme.color.paper.ink} decorative />
          ) : null}
        </View>
      </Card>
      <View style={styles.ways}>
        {paste === null ? null : (
          <Way
            icon="camera"
            title={t({ id: 'plan.tripMap.empty.paste', message: 'Paste what you saved' })}
            caption={t({
              id: 'plan.tripMap.empty.pasteLine',
              message: 'TikToks, posts, screenshots',
            })}
            onPress={paste}
            testID="trip-map-empty-paste"
          />
        )}
        {swipe === null ? null : (
          <Way
            icon="heart"
            title={t({ id: 'plan.tripMap.empty.swipe', message: 'Swipe together' })}
            caption={t({ id: 'plan.tripMap.empty.swipeLine', message: 'Matches stay' })}
            onPress={swipe}
            testID="trip-map-empty-swipe"
          />
        )}
        {copy === null ? null : (
          <Way
            icon="ticket"
            title={t({ id: 'plan.tripMap.empty.copy', message: 'Copy a crew’s plan' })}
            caption={t({ id: 'plan.tripMap.empty.copyLine', message: 'Plans other crews made' })}
            onPress={copy}
            testID="trip-map-empty-copy"
          />
        )}
      </View>
    </View>
  );
}

/** The guide floating over the empty map, where the stay will go. */
export function FloatingGuide({ model }: { readonly model: TripMapModel }) {
  const float = useLoop('float');
  const sticker = GUIDE_STICKERS[model.guide.id];
  return (
    <Animated.View style={[{ opacity: 0.55 }, float]} pointerEvents="none" testID="trip-map-guide">
      <Sticker kind={sticker.kind} name={sticker.name} size={120} />
    </Animated.View>
  );
}
