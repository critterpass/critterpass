/**
 * The day's ways on under its stops (6.04): the day plan, tomorrow (or back to today) and what
 * works with no signal, as one card of rows that each lead somewhere, the way every other list of
 * places to go in the app reads, rather than loose grey links.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { Icon, ListCard, Row, usePremiumTheme, type PremiumIconName } from '@/ui/premium';

import type { DayOfProps } from '../../day-of/use-day-of';

interface DayLink {
  readonly key: string;
  readonly icon: PremiumIconName;
  readonly title: string;
  readonly onPress: () => void;
}

export function DayLinks({ props }: { readonly props: DayOfProps }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const links: DayLink[] = [];
  if (props.onDayPlan !== undefined) {
    links.push({
      key: 'plan',
      icon: 'calendar',
      title: t({ id: 'trip.dayOf.toDayPlan', message: 'See the day plan' }),
      onPress: props.onDayPlan,
    });
  }
  if (props.onTomorrow !== undefined) {
    links.push({
      key: 'tomorrow',
      icon: 'arrowRight',
      title: t({ id: 'trip.dayOf.toTomorrow', message: 'See tomorrow' }),
      onPress: props.onTomorrow,
    });
  }
  if (props.onToday !== undefined) {
    links.push({
      key: 'today',
      icon: 'back',
      title: t({ id: 'trip.dayOf.toToday', message: 'Back to today' }),
      onPress: props.onToday,
    });
  }
  if (props.onOffline !== undefined) {
    links.push({
      key: 'offline',
      icon: 'offline',
      title: t({ id: 'trip.dayOf.toOffline', message: 'What works with no signal' }),
      onPress: props.onOffline,
    });
  }
  if (links.length === 0) return null;
  return (
    <View style={{ paddingHorizontal: th.space.gutter }}>
      <ListCard radius={th.radius.cardRow} testID="trip-day-links">
        {links.map((link) => (
          <Row
            key={link.key}
            title={link.title}
            leading={<Icon name={link.icon} size={20} color={th.color.inkSecondary} />}
            trailing={<Icon name="forward" size={16} color={th.color.muted} />}
            onPress={link.onPress}
            testID={`trip-day-${link.key}`}
          />
        ))}
      </ListCard>
    </View>
  );
}
