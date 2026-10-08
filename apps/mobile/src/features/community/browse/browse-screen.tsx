/**
 * Crew plans (3o-1): real trips other crews shared for a destination, ranked by how well they fit
 * this crew (taste, month, crew size, cost; never by copies). The top match is the hero card; the
 * rest are rows. Filters are chips; an empty destination says so honestly, and a filter with no
 * plans offers to clear it. A destination opened before shows its last copy offline.
 */
import type { SharedPlanCard } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { guideSticker } from '@/ui/avatar/guides';
import { Card } from '@/ui/cards/Card';
import { FilterChip } from '@/ui/chips/FilterChip';
import { InfoPill } from '@/ui/chips/InfoPill';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { EmptyState } from '@/ui/states/EmptyState';
import { OfflinePill } from '@/ui/states/OfflinePill';
import { Skeleton } from '@/ui/states/Skeleton';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { dataOf, useSharedPlans, type BrowseFilters } from '../api';
import { copiesLabel, costEach, crewLine, matchLabel, planTitle, ratingLabel } from '../copy';
import { communityRoutes } from '../routes';

const useStyles = makeStyles((th) => ({
  content: { paddingHorizontal: th.size.gutter, gap: th.space['16'] },
  chips: { gap: th.space['8'], paddingHorizontal: th.size.gutter },
  dayBox: {
    minWidth: 28,
    paddingVertical: th.space['4'],
    paddingHorizontal: th.space['6'],
    borderRadius: th.radius.sm,
    backgroundColor: th.semantic.bg.base,
    alignItems: 'center',
  },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', gap: th.space['8'] },
}));

type FilterKey = 'short' | 'mid' | 'long' | 'newest' | 'rating';

function filtersOf(selected: ReadonlySet<FilterKey>): BrowseFilters {
  const days = selected.has('short')
    ? { daysMax: 5 }
    : selected.has('mid')
      ? { daysMin: 6, daysMax: 8 }
      : selected.has('long')
        ? { daysMin: 9 }
        : {};
  const sort = selected.has('newest') ? 'newest' : selected.has('rating') ? 'rating' : 'match';
  return { ...days, sort };
}

export interface CrewPlansScreenProps {
  /** The destination's id or slug. */
  readonly destination: string;
  readonly tripId: string | null;
}

export function CrewPlansScreen({ destination, tripId }: CrewPlansScreenProps) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const locale = useLocale();
  const [selected, setSelected] = useState<ReadonlySet<FilterKey>>(new Set());
  const filters = useMemo(() => filtersOf(selected), [selected]);
  const { state, reload } = useSharedPlans(destination, tripId, filters);
  const page = dataOf(state);
  const guide = guideSticker(null);
  const toggle = (key: FilterKey, group: readonly FilterKey[]) =>
    setSelected((current) => {
      const next = new Set([...current].filter((one) => !group.includes(one)));
      if (!current.has(key)) next.add(key);
      return next;
    });
  const days: readonly FilterKey[] = ['short', 'mid', 'long'];
  const sorts: readonly FilterKey[] = ['newest', 'rating'];
  const chips: readonly { key: FilterKey; label: string; group: readonly FilterKey[] }[] = [
    {
      key: 'short',
      label: t({ id: 'community.filter.short', message: 'Up to 5 days' }),
      group: days,
    },
    { key: 'mid', label: t({ id: 'community.filter.mid', message: '6–8 days' }), group: days },
    { key: 'long', label: t({ id: 'community.filter.long', message: '9+ days' }), group: days },
    { key: 'newest', label: t({ id: 'community.filter.newest', message: 'Newest' }), group: sorts },
    {
      key: 'rating',
      label: t({ id: 'community.filter.rating', message: 'Top rated' }),
      group: sorts,
    },
  ];
  const plans = page?.plans ?? [];
  const pick = plans.find((plan) => plan.id === page?.pick_id) ?? null;
  const rest = plans.filter((plan) => plan.id !== pick?.id);
  const open = (plan: SharedPlanCard) => router.push(communityRoutes.plan(plan.id, tripId));

  return (
    <Scaffold testID="crew-plans">
      <ScrollView
        contentContainerStyle={{
          paddingTop: theme.space['12'],
          paddingBottom: insets.bottom + theme.space['24'],
        }}
      >
        <Stack gap="12" style={styles.content}>
          <BackEyebrow
            label={
              tripId === null
                ? t({ id: 'community.back.explore', message: 'Explore' })
                : t({ id: 'community.back.trip', message: 'Trip' })
            }
          />
          <Row gap="8" wrap>
            {page === null ? null : (
              <InfoPill testID="crew-plans-total">
                {t({ id: 'community.browse.total', message: `${page.total} shared` })}
              </InfoPill>
            )}
            {state.status === 'stale' && state.source === 'cache' ? (
              <OfflinePill label={t({ id: 'community.offline', message: 'No signal' })} />
            ) : null}
          </Row>
          <Text variant="displayHero" accessibilityRole="header">
            {t({ id: 'community.browse.title', message: 'Crew plans' })}
          </Text>
          <Text variant="body">
            {t({
              id: 'community.browse.intro',
              message:
                'Real trips, shared by the crews who took them. Copy a whole one, or just the good days.',
            })}
          </Text>
        </Stack>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {chips.map((chip) => (
            <FilterChip
              key={chip.key}
              label={chip.label}
              selected={selected.has(chip.key)}
              onPress={() => toggle(chip.key, chip.group)}
              testID={`crew-plans-filter-${chip.key}`}
            />
          ))}
        </ScrollView>
        <Stack gap="12" style={[styles.content, { paddingTop: theme.space['16'] }]}>
          {state.status === 'loading' ? <Skeleton preset="card" repeat={3} /> : null}
          {state.status === 'missing' ? (
            <EmptyState
              guide="tokek"
              guideName={guide.name}
              title={t({
                id: 'community.browse.offlineTitle',
                message: 'Crew plans need a signal',
              })}
              line={t({
                id: 'community.browse.offlineLine',
                message: 'Open this once online and it stays here for later.',
              })}
              action={{
                label: t({ id: 'community.retry', message: 'Try again' }),
                onPress: reload,
              }}
              testID="crew-plans-missing"
            />
          ) : null}
          {page !== null && page.total === 0 && selected.size === 0 ? (
            <EmptyState
              guide="tokek"
              guideName={guide.name}
              title={t({ id: 'community.browse.emptyTitle', message: 'No crew plans yet' })}
              line={t({
                id: 'community.browse.empty',
                message: 'No crew has shared this place yet. Yours could be first.',
              })}
              testID="crew-plans-empty"
            />
          ) : null}
          {page !== null && plans.length === 0 && selected.size > 0 ? (
            <EmptyState
              guide="tokek"
              guideName={guide.name}
              title={t({ id: 'community.browse.noResults', message: 'Nothing fits those filters' })}
              line={t({
                id: 'community.browse.noResultsLine',
                message: 'Fewer filters, more plans.',
              })}
              action={{
                label: t({ id: 'community.browse.clear', message: 'Clear filters' }),
                onPress: () => setSelected(new Set()),
              }}
              testID="crew-plans-no-results"
            />
          ) : null}
          {pick === null ? null : (
            <PickCard plan={pick} locale={locale} onPress={() => open(pick)} />
          )}
          {rest.map((plan) => (
            <Card
              key={plan.id}
              tone="raised"
              onPress={() => open(plan)}
              testID={`crew-plan-${plan.id}`}
              accessibilityLabel={planTitle(plan)}
            >
              <View style={styles.rowHead}>
                <Text variant="title" numberOfLines={2} style={{ flex: 1 }}>
                  {planTitle(plan)}
                </Text>
                <Text variant="label">{ratingLabel(plan)}</Text>
              </View>
              <Text variant="bodySm">
                {[crewLine(plan, locale), costEach(plan, locale)]
                  .filter((part) => part !== null)
                  .join(' · ')}
              </Text>
            </Card>
          ))}
        </Stack>
      </ScrollView>
    </Scaffold>
  );
}

function PickCard({
  plan,
  locale,
  onPress,
}: {
  plan: SharedPlanCard;
  locale: string;
  onPress: () => void;
}) {
  const { t } = useLingui();
  const styles = useStyles();
  const cost = costEach(plan, locale);
  return (
    <Card
      tone="orange"
      halftone
      radius="cardBig"
      onPress={onPress}
      testID="crew-plans-pick"
      accessibilityLabel={planTitle(plan)}
    >
      <Stack gap="8">
        <View style={styles.rowHead}>
          <InfoPill>{t({ id: 'community.browse.pick', message: 'Picked for you' })}</InfoPill>
          <Text variant="label">{ratingLabel(plan)}</Text>
        </View>
        <Text variant="displayXl">{planTitle(plan)}</Text>
        <Text variant="body">{crewLine(plan, locale)}</Text>
        <Row gap="6" wrap>
          {Array.from({ length: Math.min(plan.days_count, 10) }, (_, index) => (
            <View key={index} style={styles.dayBox}>
              <Text variant="label">{String(index + 1)}</Text>
            </View>
          ))}
        </Row>
        <Row gap="6" wrap>
          {cost === null ? null : <InfoPill>{cost}</InfoPill>}
          {plan.match_pct === null ? null : <InfoPill>{matchLabel(plan.match_pct)}</InfoPill>}
          <InfoPill>{copiesLabel(plan.copies_count)}</InfoPill>
        </Row>
        {plan.travelled ? null : (
          <Text variant="caption">
            {t({ id: 'community.notTravelled', message: 'Planned, not travelled yet' })}
          </Text>
        )}
      </Stack>
    </Card>
  );
}
