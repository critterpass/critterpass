/**
 * A shared crew plan, premium: while it loads, skeletons under the page title; out of reach, the
 * guide's empty state with Try again; taken down, a tombstone. Once read, the plan itself.
 */
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { guideSticker } from '@/ui/premium/stickers/guides';
import { Button, EmptyState, LoadingCritter, Skeleton, Text, usePremiumTheme } from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { dataOf, useSharedPlan } from '../api';
import { PlanPremiumView } from './plan-premium-view';

/** The guide's sticker in the empty and loading states. */
const GECKO = guideSticker(null);

/** The plan's page before there is a plan to show: the heading, the intro and what happened. */
export function PlanPagePlaceholder({
  backLabel,
  testID,
  children,
}: {
  readonly backLabel: string;
  readonly testID: string;
  readonly children: ReactNode;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const heading = t({ id: 'community.detail.heading', message: 'A crew plan' });
  return (
    <PushScreen title={heading} backLabel={backLabel} testID={testID}>
      <View style={{ paddingHorizontal: th.space.gutter, gap: th.space.gap12 }}>
        <Text variant="largeTitle" accessibilityRole="header">
          {heading}
        </Text>
        <Text variant="body" tone="muted">
          {t({
            id: 'community.browse.intro',
            message:
              'Real trips, shared by the crews who took them. Copy a whole one, or just the good days.',
          })}
        </Text>
        <View style={{ paddingTop: th.space.gap12 }}>{children}</View>
      </View>
    </PushScreen>
  );
}

export function PlanLoading() {
  const th = usePremiumTheme();
  const { t } = useLingui();
  return (
    <View style={{ gap: th.space.gap12 }}>
      <Skeleton height={120} tone="block" radius={th.radius.cardLarge} />
      <Skeleton height={180} tone="soft" radius={th.radius.card} />
      <LoadingCritter
        label={t({ id: 'community.premium.planLoading', message: 'Opening the plan…' })}
        critter={GECKO}
      />
    </View>
  );
}

export interface SharedPlanScreenProps {
  readonly sharedPlanId: string;
  readonly tripId: string | null;
  /** Where back leads; a plan opened from a link came from Home. */
  readonly backLabel?: string;
}

export function SharedPlanPremiumScreen({
  sharedPlanId,
  tripId,
  backLabel,
}: SharedPlanScreenProps) {
  const { t } = useLingui();
  const back = backLabel ?? t({ id: 'community.back.plans', message: 'Crew plans' });
  const { state, reload } = useSharedPlan(sharedPlanId);
  const detail = dataOf(state);
  if (detail === null) {
    return (
      <PlanPagePlaceholder backLabel={back} testID="shared-plan">
        {state.status === 'loading' ? (
          <PlanLoading />
        ) : (
          <EmptyState
            critter={GECKO}
            check={false}
            title={t({ id: 'community.detail.missing', message: 'This plan is out of reach' })}
            line={t({
              id: 'community.detail.missingLine',
              message: 'It needs a signal the first time.',
            })}
            action={
              <Button
                label={t({ id: 'community.retry', message: 'Try again' })}
                variant="secondary"
                size="medium"
                onPress={reload}
              />
            }
          />
        )}
      </PlanPagePlaceholder>
    );
  }
  if (detail.status === 'unpublished' || detail.projection === null) {
    return (
      <PlanPagePlaceholder backLabel={back} testID="shared-plan-tombstone">
        <EmptyState
          critter={GECKO}
          check={false}
          title={t({ id: 'community.detail.gone', message: 'This plan was taken down' })}
          line={t({
            id: 'community.detail.goneLine',
            message: 'Its crew stopped sharing it. Plenty more where it came from.',
          })}
        />
      </PlanPagePlaceholder>
    );
  }
  return (
    <PlanPremiumView
      detail={detail}
      projection={detail.projection}
      tripId={tripId}
      backLabel={back}
      onChanged={reload}
    />
  );
}
