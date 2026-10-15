/**
 * Day by day on a shared plan, premium: each day's badge, theme and places on one list card, with
 * "+" to take one day once the trip it goes into is known. Three days show at first; the rest open
 * in place.
 */
import type { SharedPlanProjection } from '@cp/domain';
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import {
  IconButton,
  layoutTransition,
  ListCard,
  Row,
  Text,
  TextButton,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';

const SHOWN_DAYS = 3;

function DayNumber({ dayNo }: { readonly dayNo: number }) {
  const th = usePremiumTheme();
  return (
    <View
      style={{
        width: 36,
        height: 36,
        borderRadius: th.radius.dayBadge,
        backgroundColor: th.accent.tangerine,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text variant="rowTextStrong" tone="onAccent">
        {String(dayNo)}
      </Text>
    </View>
  );
}

export function PlanDaysPremium({
  days: all,
  canAdd,
  disabled,
  onAdd,
}: {
  readonly days: SharedPlanProjection['days'];
  /** A trip is known, so a single day can be taken. */
  readonly canAdd: boolean;
  readonly disabled: boolean;
  readonly onAdd: (dayNo: number) => void;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const reduced = usePremiumReducedMotion();
  const [allDays, setAllDays] = useState(false);
  const days = allDays ? all : all.slice(0, SHOWN_DAYS);
  const hidden = all.length - days.length;
  return (
    <View style={{ gap: th.space.gap8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="headline" accessibilityRole="header">
          {t({ id: 'community.detail.dayByDay', message: 'Day by day' })}
        </Text>
        {canAdd ? (
          <Text variant="caption" tone="muted">
            {t({ id: 'community.detail.addsOne', message: '+ adds one day' })}
          </Text>
        ) : null}
      </View>
      <Animated.View layout={layoutTransition(reduced)}>
        <ListCard>
          {days.map((day) => (
            <Row
              key={day.day_no}
              badgeLeads
              leading={<DayNumber dayNo={day.day_no} />}
              title={day.theme ?? day.places[0]?.name ?? ''}
              subtitle={day.places.map((place) => place.name).join(' · ')}
              trailing={
                canAdd ? (
                  <IconButton
                    icon="plus"
                    label={t({ id: 'community.detail.addDay', message: `Add day ${day.day_no}` })}
                    disabled={disabled}
                    onPress={() => onAdd(day.day_no)}
                    testID={`shared-plan-add-${day.day_no}`}
                  />
                ) : undefined
              }
              testID={`shared-plan-day-${day.day_no}`}
            />
          ))}
        </ListCard>
      </Animated.View>
      {hidden > 0 ? (
        <TextButton
          label={t({
            id: 'community.detail.moreDays',
            message: plural(hidden, { one: '+ # more day', other: '+ # more days' }),
          })}
          onPress={() => setAllDays(true)}
          testID="shared-plan-more-days"
        />
      ) : null}
    </View>
  );
}
