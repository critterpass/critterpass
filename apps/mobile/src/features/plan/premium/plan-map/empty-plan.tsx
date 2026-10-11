/**
 * Nothing saved yet (4.56), in the plan map's sheet: the trip's line, the headline and four ways
 * to start, the guide drafting it first (ringed in ink; a member asks the organiser instead), then
 * pasting what was saved, swiping together and copying a crew's plan. While the organiser drafts,
 * a member reads that the plan is on its way and that saved places wait in Ideas.
 */
/* eslint-disable lingui/no-unlocalized-strings -- design screen ids, never copy. */
import { plural, t } from '@lingui/core/macro';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTripTurnView } from '@/features/home';
import { useLocale } from '@/lib/i18n/use-locale';
import { useScreenHref } from '@/lib/navigation/screen-registry';
import { Icon, PressableScale, Text, usePremiumTheme } from '@/ui/premium';

import { Doodle, type DoodleName } from '@/features/explore';
import { planRoutes } from '../../overview/routes';
import { tripDates } from '../../trip-map/format';
import type { TripMapModel } from '../../trip-map/sheet-props';
import { opener } from '../../trip-map/use-ways-out';

function StartRow(props: {
  readonly icon: DoodleName;
  readonly title: string;
  readonly line: string;
  readonly ringed?: boolean;
  readonly onPress: (() => void) | null;
  readonly testID: string;
}): ReactNode {
  const theme = usePremiumTheme();
  return (
    <PressableScale
      onPress={props.onPress ?? undefined}
      disabled={props.onPress === null}
      accessibilityRole="button"
      accessibilityLabel={`${props.title}. ${props.line}`}
      testID={props.testID}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space.gap12,
        padding: theme.space.gap12,
        borderRadius: theme.radius.banner,
        backgroundColor: theme.color.card,
        boxShadow: theme.shadow.card,
        borderWidth: props.ringed === true ? 2 : 0,
        borderColor: theme.color.ink,
      }}
    >
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 12.6,
          backgroundColor: theme.color.ground,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Doodle name={props.icon} size={38} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="rowTitle">{props.title}</Text>
        <Text variant="caption" tone="muted">
          {props.line}
        </Text>
      </View>
      {props.onPress === null ? null : (
        <Icon name="forward" size={16} color={theme.color.placeholder} />
      )}
    </PressableScale>
  );
}

export function EmptyPlan({ model }: { readonly model: TripMapModel }) {
  const theme = usePremiumTheme();
  const locale = useLocale();
  const tripId = model.tripId;
  const paste = opener(useScreenHref('7d-3', { tripId }));
  const swipe = opener(useScreenHref('7g-2', { tripId, sessionId: 'new' }));
  const copy = opener(useScreenHref('3o-1', { tripId, destination: model.destinationSlug ?? '' }));
  const turn = useTripTurnView(tripId, { locale, guide: model.guide.name });
  const planComing = turn?.kind === 'plan_coming' ? turn : null;
  const guide = model.guide.name;
  const saved = model.ideas.length;
  const going = model.members.length;
  const head = [
    model.destination ?? '',
    tripDates(locale, model.startDate, model.endDate),
    t({ id: 'plan.tripMap.going', message: `${going} going` }),
  ]
    .filter((part) => part !== '')
    .join(' · ');
  return (
    <View style={{ gap: theme.space.gap8, paddingTop: theme.space.gap12 }} testID="trip-map-empty">
      <Text variant="caption" tone="muted">
        {head}
      </Text>
      <Text variant="emptyTitle" testID="trip-map-empty-title">
        {planComing !== null
          ? t({ id: 'plan.tripMap.empty.comingTitle', message: 'The plan is on its way' })
          : saved > 0
            ? t({ id: 'plan.tripMap.empty.noPlanTitle', message: 'No plan yet' })
            : t({ id: 'plan.tripMap.empty.title', message: 'Nothing saved yet' })}
      </Text>
      <Text variant="body" tone="muted">
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
      <View style={{ gap: theme.space.gap8, marginTop: theme.space.gap6 }}>
        {planComing !== null ? null : (
          <StartRow
            icon="spark"
            ringed
            title={
              model.organiser
                ? t({ id: 'plan.tripMap.empty.draft', message: `Let ${guide} draft it` })
                : t({
                    id: 'plan.tripMap.empty.askDraft',
                    message: `Ask your organiser to let ${guide} draft it`,
                  })
            }
            line={t({
              id: 'plan.tripMap.empty.draftLine',
              message: 'A day-by-day plan from your must-dos, in about a minute.',
            })}
            onPress={model.organiser ? () => router.push(planRoutes.setup(tripId)) : null}
            testID="trip-map-empty-draft"
          />
        )}
        {paste === null ? null : (
          <StartRow
            icon="camera"
            title={t({ id: 'plan.tripMap.empty.paste', message: 'Paste what you saved' })}
            line={t({ id: 'plan.tripMap.empty.pasteLine', message: 'TikToks, posts, screenshots' })}
            onPress={paste}
            testID="trip-map-empty-paste"
          />
        )}
        {swipe === null ? null : (
          <StartRow
            icon="heart"
            title={t({ id: 'plan.tripMap.empty.swipe', message: 'Swipe together' })}
            line={t({ id: 'plan.tripMap.empty.swipeLine', message: 'Matches stay' })}
            onPress={swipe}
            testID="trip-map-empty-swipe"
          />
        )}
        {copy === null ? null : (
          <StartRow
            icon="ticket"
            title={t({ id: 'plan.tripMap.empty.copy', message: 'Copy a crew’s plan' })}
            line={t({ id: 'plan.tripMap.empty.copyLine', message: 'Plans other crews made' })}
            onPress={copy}
            testID="trip-map-empty-copy"
          />
        )}
      </View>
    </View>
  );
}
