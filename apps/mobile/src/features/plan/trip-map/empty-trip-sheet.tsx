/**
 * Nothing saved yet (7i-1): the trip map's sheet when the plan has no stops and the crew has saved
 * nothing, with the four ways to start. LET THE GUIDE DRAFT IT fills the days (the organiser's;
 * members are asked to nudge the organiser instead, undesigned); PASTE WHAT YOU SAVED, SWIPE
 * TOGETHER and COPY A CREW'S PLAN fill Ideas, each shown once its screen is registered. The guide
 * floats over the map where the stay will be. A member whose organiser is already drafting or
 * reviewing reads one true message instead ("Linh is still working on the plan. You'll get it
 * here."), with no card asking for a draft that exists (undesigned, logged), and the head counts
 * the crew, not people "going", until a plan has gone out. Someone with places saved and no plan to
 * see yet reads "No plan yet" and that their places wait in Ideas (undesigned, logged).
 */
/* eslint-disable lingui/no-unlocalized-strings -- design ids and route params, never copy. */
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useTripTurnView } from '@/features/home';
import { useLocale } from '@/lib/i18n/use-locale';
import { useScreenHref } from '@/lib/navigation/screen-registry';
import { useLoop } from '@/motion/use-loop';
import { guideSticker } from '@/ui/avatar/guides';
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
        tone="sunken"
        onPress={onPress}
        accessibilityLabel={`${title}, ${caption}`}
        testID={testID}
        style={{ flex: 1 }}
      >
        <View style={styles.wayBody}>
          <Icon name={icon} size={24} decorative />
          {/* The design sets these on two lines ("PASTE WHAT / YOU SAVED"). */}
          <Text variant="label" singleLine={false}>
            {title}
          </Text>
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
  // Swipe together in a trip (7g-2).
  const swipe = opener(useScreenHref('7g-2', { tripId, sessionId: 'new' }));
  const copy = opener(useScreenHref('3o-1', { tripId, destination: model.destinationSlug ?? '' }));
  const going = model.members.length;
  const dates = tripDates(locale, model.startDate, model.endDate);
  // The organiser is drafting or reviewing: the member waits, and nobody is "going" yet.
  const turn = useTripTurnView(tripId, { locale, guide: model.guide.name });
  const planComing = turn?.kind === 'plan_coming' ? turn : null;
  const crew = planComing?.crewSize ?? 0;
  const head = [
    model.destination ?? '',
    dates,
    planComing === null
      ? t({ id: 'plan.tripMap.going', message: `${going} going` })
      : t({ id: 'plan.tripMap.inCrew', message: `${crew} in the crew` }),
  ]
    .filter((part) => part !== '')
    .join(' · ');
  const guide = model.guide.name;
  const organiser = model.organiser;
  // Places already saved while there is no plan to see (a member before the plan is shared).
  const saved = model.ideas.length;
  return (
    <View style={styles.body} testID="trip-map-empty">
      <Text variant="eyebrow" color={theme.semantic.text.secondary}>
        {head}
      </Text>
      <Text variant="h1" singleLine={false} testID="trip-map-empty-title">
        {planComing !== null
          ? t({ id: 'plan.tripMap.empty.comingTitle', message: 'The plan is on its way' })
          : saved > 0
            ? t({ id: 'plan.tripMap.empty.noPlanTitle', message: 'No plan yet' })
            : t({ id: 'plan.tripMap.empty.title', message: 'Nothing saved yet' })}
      </Text>
      <Text variant="body" color={theme.semantic.text.secondary}>
        {planComing !== null
          ? planComing.line
          : saved > 0
            ? t({
                id: 'plan.tripMap.empty.noPlanLine',
                message: plural(saved, {
                  one: 'One place is saved in Ideas. It goes onto a day once there is a plan.',
                  other: '# places are saved in Ideas. They go onto days once there is a plan.',
                }),
              })
            : t({
                id: 'plan.tripMap.empty.line',
                message: 'Four ways to start. Most crews mix two.',
              })}
      </Text>
      {planComing === null ? null : (
        <Text variant="bodySm" color={theme.semantic.text.secondary}>
          {t({
            id: 'plan.tripMap.empty.comingMeanwhile',
            message: 'Meanwhile, save the places you want. They wait in Ideas.',
          })}
        </Text>
      )}
      {planComing !== null ? null : (
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
      )}
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
  const sticker = guideSticker(model.guide.id);
  return (
    <Animated.View style={[{ opacity: 0.55 }, float]} pointerEvents="none" testID="trip-map-guide">
      <Sticker kind={sticker.kind} name={sticker.name} size={120} />
    </Animated.View>
  );
}
