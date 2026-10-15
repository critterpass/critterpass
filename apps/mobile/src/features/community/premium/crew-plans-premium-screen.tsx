/**
 * Crew plans in the premium look: real trips other crews shared for a destination, ranked by how
 * well they fit this crew. Pushed with the glass back. The top match is the hero card with its day
 * strip; the rest are rows on one card. Filters are chips; an empty destination says so honestly,
 * a filter with no plans offers to clear it, and a destination opened before shows its last copy
 * offline.
 */
import type { SharedPlanCard } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useLocale } from '@/lib/i18n/use-locale';
import { guideSticker } from '@/ui/premium/stickers/guides';
import {
  Button,
  Card,
  EmptyState,
  enterTransition,
  Icon,
  ListCard,
  OfflinePill,
  PressableScale,
  Row,
  Skeleton,
  StatusTag,
  Tag,
  ROW_ROOM_ABOVE,
  ROW_ROOM_BELOW,
  ScrollRow,
  Text,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { useCrewPlans } from '../browse/use-crew-plans';
import { copiesLabel, costEach, crewLine, matchLabel, planTitle, ratingLabel } from '../copy';
import { CommunityChip } from './community-chip';

/** The guide's sticker in the empty and loading states. */
const GECKO = guideSticker(null);
/** Days the hero's strip draws before it stops counting. */
const STRIP_DAYS = 10;

function PickCard({
  plan,
  onPress,
}: {
  readonly plan: SharedPlanCard;
  readonly onPress: () => void;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const cost = costEach(plan, locale);
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={planTitle(plan)}
      testID="crew-plans-pick"
    >
      <Card
        padded
        radius={th.radius.cardLarge}
        style={{ gap: th.space.gap10, paddingTop: th.space.gap16 }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Tag label={t({ id: 'community.browse.pick', message: 'Picked for you' })} />
          <Text variant="label" tone="muted">
            {ratingLabel(plan)}
          </Text>
        </View>
        <Text variant="title">{planTitle(plan)}</Text>
        <Text variant="rowText" tone="muted">
          {crewLine(plan, locale)}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: th.space.gap6 }}>
          {Array.from({ length: Math.min(plan.days_count, STRIP_DAYS) }, (_, index) => (
            <View
              key={index}
              style={{
                minWidth: 28,
                paddingVertical: th.space.gap4,
                borderRadius: th.radius.dayBadge,
                backgroundColor: th.color.control,
                alignItems: 'center',
              }}
            >
              <Text variant="badge">{String(index + 1)}</Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: th.space.gap6 }}>
          {cost === null ? null : <StatusTag tone="booked" label={cost} />}
          {plan.match_pct === null ? null : (
            <StatusTag tone="voteOpen" label={matchLabel(plan.match_pct)} />
          )}
          <StatusTag tone="unopened" label={copiesLabel(plan.copies_count)} />
        </View>
        {plan.travelled ? null : (
          <Text variant="caption" tone="muted">
            {t({ id: 'community.notTravelled', message: 'Planned, not travelled yet' })}
          </Text>
        )}
      </Card>
    </PressableScale>
  );
}

export interface CrewPlansScreenProps {
  /** The destination's id or slug. */
  readonly destination: string;
  readonly tripId: string | null;
}

export function CrewPlansPremiumScreen({ destination, tripId }: CrewPlansScreenProps) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const reduced = usePremiumReducedMotion();
  const plans = useCrewPlans(destination, tripId);
  const { state, page, pick, rest, selected } = plans;
  const chevron = <Icon name="forward" size={16} color={th.color.placeholder} />;

  return (
    <PushScreen
      title={t({ id: 'community.browse.title', message: 'Crew plans' })}
      backLabel={
        tripId === null
          ? t({ id: 'community.back.explore', message: 'Explore' })
          : t({ id: 'community.back.trip', message: 'Trip' })
      }
      largeTitle
      testID="crew-plans"
    >
      <View style={{ paddingHorizontal: th.space.gutter, gap: th.space.gap8 }}>
        <Text variant="body" tone="muted">
          {t({
            id: 'community.browse.intro',
            message:
              'Real trips, shared by the crews who took them. Copy a whole one, or just the good days.',
          })}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: th.space.gap8 }}>
          {/* None shared says itself in the empty state below: no "0 shared" pill above it. */}
          {page === null || page.total === 0 ? null : (
            <StatusTag
              tone="unopened"
              label={t({ id: 'community.browse.total', message: `${page.total} shared` })}
              testID="crew-plans-total"
            />
          )}
          {state.status === 'stale' && state.source === 'cache' ? (
            <OfflinePill label={t({ id: 'community.offline', message: 'No signal' })} />
          ) : null}
        </View>
      </View>
      {/* The chips' shadows get room under the row instead of ending in a flat band. */}
      <ScrollRow
        gap={th.space.gap8}
        contentContainerStyle={{ paddingHorizontal: th.space.gutter }}
        style={{
          marginTop: th.space.gap14 - ROW_ROOM_ABOVE,
          marginBottom: th.space.gap14 - ROW_ROOM_BELOW,
        }}
      >
        {plans.chips.map((chip) => (
          <CommunityChip
            key={chip.key}
            label={chip.label}
            selected={selected.has(chip.key)}
            onPress={() => plans.toggle(chip.key, chip.group)}
            testID={`crew-plans-filter-${chip.key}`}
          />
        ))}
      </ScrollRow>
      <View
        style={{
          paddingHorizontal: th.space.gutter,
          gap: th.space.gap12,
          // An empty or missing state's disc gets air under the chips instead of touching them.
          paddingTop: page === null || plans.plans.length === 0 ? th.space.gap16 : 0,
        }}
      >
        {state.status === 'loading' ? (
          <View style={{ gap: th.space.gap12 }}>
            <Skeleton height={220} tone="block" radius={th.radius.cardLarge} />
            <Skeleton height={64} tone="soft" radius={th.radius.card} />
            <Skeleton height={64} tone="soft" radius={th.radius.card} />
          </View>
        ) : null}
        {state.status === 'missing' && state.reason === 'not_found' ? (
          // The guide has no such place: no signal would bring its plans, so no Try again.
          <EmptyState
            critter={GECKO}
            check={false}
            title={t({
              id: 'community.browse.notFoundTitle',
              message: 'That place isn’t in the guide',
            })}
            line={t({
              id: 'community.browse.notFoundLine',
              message: 'Crew plans live on a destination’s page. Search for the place to find it.',
            })}
            testID="crew-plans-not-found"
          />
        ) : null}
        {state.status === 'missing' && state.reason !== 'not_found' ? (
          <EmptyState
            critter={GECKO}
            check={false}
            title={
              state.reason === 'offline'
                ? t({ id: 'community.browse.offlineTitle', message: 'Crew plans need a signal' })
                : t({ id: 'community.browse.failedTitle', message: 'Crew plans didn’t load' })
            }
            line={
              state.reason === 'offline'
                ? t({
                    id: 'community.browse.offlineLine',
                    message: 'Open this once online and it stays here for later.',
                  })
                : t({
                    id: 'community.browse.failedLine',
                    message: 'Something went wrong on our side. Try again in a moment.',
                  })
            }
            action={
              <Button
                label={t({ id: 'community.retry', message: 'Try again' })}
                variant="secondary"
                size="medium"
                onPress={plans.reload}
              />
            }
            testID="crew-plans-missing"
          />
        ) : null}
        {page !== null && page.total === 0 && selected.size === 0 ? (
          <EmptyState
            critter={GECKO}
            check={false}
            title={t({ id: 'community.browse.emptyTitle', message: 'No crew plans yet' })}
            line={t({
              id: 'community.browse.empty',
              message: 'No crew has shared this place yet. Yours could be first.',
            })}
            testID="crew-plans-empty"
          />
        ) : null}
        {page !== null && plans.plans.length === 0 && selected.size > 0 ? (
          <EmptyState
            critter={GECKO}
            check={false}
            title={t({ id: 'community.browse.noResults', message: 'Nothing fits those filters' })}
            line={t({
              id: 'community.browse.noResultsLine',
              message: 'Fewer filters, more plans.',
            })}
            action={
              <Button
                label={t({ id: 'community.browse.clear', message: 'Clear filters' })}
                variant="secondary"
                size="medium"
                onPress={plans.clear}
              />
            }
            testID="crew-plans-no-results"
          />
        ) : null}
        {pick === null ? null : (
          <Animated.View key={pick.id} entering={enterTransition(reduced)}>
            <PickCard plan={pick} onPress={() => plans.open(pick)} />
          </Animated.View>
        )}
        {rest.length === 0 ? null : (
          <Animated.View entering={enterTransition(reduced)}>
            <ListCard>
              {rest.map((plan) => (
                <Row
                  key={plan.id}
                  title={planTitle(plan)}
                  subtitle={[crewLine(plan, locale), costEach(plan, locale)]
                    .filter((part) => part !== null)
                    .join(' · ')}
                  trailingText={ratingLabel(plan)}
                  trailing={chevron}
                  onPress={() => plans.open(plan)}
                  testID={`crew-plan-${plan.id}`}
                />
              ))}
            </ListCard>
          </Animated.View>
        )}
      </View>
    </PushScreen>
  );
}
