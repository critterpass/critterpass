/**
 * DAY BY DAY on a shared plan (3o-2): each day's theme and places, with "+" to take one day once
 * the trip it goes into is known. Three days show at first; the rest open in place.
 */
import type { SharedPlanProjection } from '@cp/domain';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { IconButton } from '@/ui/buttons/IconButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { Card } from '@/ui/cards/Card';
import { Text } from '@/ui/text/Text';
import { makeStyles } from '@/ui/theme';

const SHOWN_DAYS = 3;

const useStyles = makeStyles((th) => ({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  day: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space['12'],
    paddingVertical: th.space['8'],
  },
  dayNo: {
    width: 32,
    height: 32,
    borderRadius: th.radius.sm,
    backgroundColor: th.color.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grow: { flex: 1 },
}));

export interface PlanDaysProps {
  readonly days: SharedPlanProjection['days'];
  /** A trip is known, so a single day can be taken. */
  readonly canAdd: boolean;
  readonly disabled: boolean;
  readonly onAdd: (dayNo: number) => void;
}

export function PlanDays({ days: all, canAdd, disabled, onAdd }: PlanDaysProps) {
  const { t } = useLingui();
  const styles = useStyles();
  const locale = useLocale();
  const [allDays, setAllDays] = useState(false);
  const days = allDays ? all : all.slice(0, SHOWN_DAYS);
  const hidden = all.length - days.length;
  return (
    <>
      <View style={styles.head}>
        <Text variant="eyebrow">
          {t({ id: 'community.detail.dayByDay', message: 'Day by day' })}
        </Text>
        {!canAdd ? null : (
          <Text variant="caption">
            {t({ id: 'community.detail.addsOne', message: '+ adds one day' })}
          </Text>
        )}
      </View>
      <Card tone="raised">
        {days.map((day) => (
          <View key={day.day_no} style={styles.day} testID={`shared-plan-day-${day.day_no}`}>
            <View style={styles.dayNo}>
              <Text variant="label">{String(day.day_no)}</Text>
            </View>
            <View style={styles.grow}>
              <Text variant="rowTitle" numberOfLines={1}>
                {upper(day.theme ?? day.places[0]?.name ?? '', locale)}
              </Text>
              <Text variant="bodySm" numberOfLines={1}>
                {day.places.map((place) => place.name).join(' · ')}
              </Text>
            </View>
            {!canAdd ? null : (
              <IconButton
                label={t({ id: 'community.detail.addDay', message: `Add day ${day.day_no}` })}
                glyph={<Text variant="title">+</Text>}
                disabled={disabled}
                onPress={() => onAdd(day.day_no)}
                testID={`shared-plan-add-${day.day_no}`}
              />
            )}
          </View>
        ))}
        {hidden > 0 ? (
          <TextLink
            label={t({ id: 'community.detail.moreDays', message: `+ ${hidden} more days` })}
            onPress={() => setAllDays(true)}
            testID="shared-plan-more-days"
          />
        ) : null}
      </Card>
    </>
  );
}
