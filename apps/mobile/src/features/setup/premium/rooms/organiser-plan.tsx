/**
 * The organiser's rooms (7.07): a summary card (rooms and nights, the stay and its dates, Booked
 * once a booking is attached), "Who sleeps where" with the guide's first go, each stay's rooms,
 * the guide's note on what it grouped, the per-person price, and for a trip with several stays
 * whether the same pairs share at every stay.
 */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { guideCritterKind, IconTile } from '@/features/trip';
import { useLocale } from '@/lib/i18n/use-locale';
import { GuideNote, StatusTag, Text, Toggle, usePremiumTheme } from '@/ui/premium';

import { money } from '../../budget/model';
import { dayRange } from '../../data/date-range';
import {
  fractionDigits,
  stayDates,
  traitsOf,
  type PerPerson,
  type RoomsPlan,
} from '../../rooms/model';
import type { SetupMember } from '../../data/setup-trip';
import { organiserLine, stayName } from '../../rooms/copy';
import { RoomList } from './room-list';

export function OrganiserPlan(props: {
  readonly plan: RoomsPlan;
  readonly tripStart: string | null;
  readonly guide: { readonly id: string; readonly name: string };
  readonly people: ReadonlyMap<string, SetupMember>;
  readonly price: PerPerson | null;
  readonly onSeparate: (stayKey: string, separate: boolean) => void;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const { plan } = props;
  const rooms = plan.stays[0]?.rooms.length ?? 0;
  const nights = plan.stays.reduce((sum, stay) => sum + stay.nights, 0);
  const names = plan.stays.map((stay) => stayName(stay.type)).join(' + ');
  const span = stayDates(plan, 0, props.tripStart);
  const dates = span === null ? null : dayRange(locale, span.from, span.to);
  const second = plan.stays[1];
  const price = props.price;
  const whole = (units: number) =>
    money(locale, units * 10 ** fractionDigits(plan.currency), plan.currency);
  return (
    <View style={{ gap: th.space.gap16 }}>
      <View
        style={[
          styles.summary,
          {
            borderRadius: th.radius.cardRow,
            backgroundColor: th.color.card,
            boxShadow: th.shadow.card,
          },
        ]}
        testID="setup-rooms-summary"
      >
        <IconTile
          name="bed"
          bg={th.color.status.rain.bg}
          color={th.color.status.rain.text}
          size={44}
        />
        <View style={styles.flex}>
          <Text variant="headline">
            {t({
              id: 'setup.premium.rooms.summary',
              message: `${rooms} rooms · ${nights} nights`,
            })}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {dates === null ? names : `${names} · ${dates}`}
          </Text>
        </View>
        {plan.bookingId === null ? null : (
          <StatusTag
            label={t({ id: 'setup.premium.rooms.booked', message: 'Booked' })}
            tone="booked"
          />
        )}
      </View>
      <View style={styles.section}>
        <Text variant="title" style={styles.flex} accessibilityRole="header">
          {t({ id: 'setup.rooms.title', message: 'Who sleeps where?' })}
        </Text>
        {plan.locked ? null : (
          <Text variant="caption" color={th.color.status.maybe.text}>
            {t({
              id: 'setup.premium.rooms.firstGo',
              message: `${props.guide.name}'s first go`,
            })}
          </Text>
        )}
      </View>
      {plan.stays.map((stay, index) =>
        index > 0 && plan.samePairsAllStays ? null : (
          <View key={stay.key} style={{ gap: th.space.gap8 }}>
            {plan.stays.length > 1 ? (
              <Text variant="label" tone="muted">
                {stayName(stay.type)}
              </Text>
            ) : null}
            <RoomList stay={stay} currency={plan.currency} people={props.people} />
          </View>
        ),
      )}
      <GuideNote
        name={props.guide.name}
        critter={guideCritterKind(props.guide.id)}
        text={organiserLine(props.guide.name, traitsOf(plan))}
      />
      {price === null ? null : (
        <Text
          variant="rowTextStrong"
          align="center"
          style={styles.tabular}
          testID="setup-rooms-price"
        >
          {price.low === price.high
            ? t({
                id: 'setup.premium.rooms.priceEach',
                message: `${whole(price.low)} each, estimate`,
              })
            : t({
                id: 'setup.premium.rooms.priceRange',
                message: `${whole(price.low)}–${whole(price.high)} each, estimate`,
              })}
        </Text>
      )}
      {second === undefined ? null : (
        <View
          style={[
            styles.toggle,
            {
              borderRadius: th.radius.cardRow,
              backgroundColor: th.color.card,
              boxShadow: th.shadow.card,
            },
          ]}
        >
          <View style={styles.flex}>
            <Text variant="rowTitle">
              {t({
                id: 'setup.premium.rooms.samePairs',
                message: `Same pairs at the ${stayName(second.type)}`,
              })}
            </Text>
            <Text variant="caption" tone="muted">
              {t({
                id: 'setup.premium.rooms.samePairsLine',
                message: 'Everyone keeps the same roommates at every stay.',
              })}
            </Text>
          </View>
          <Toggle
            value={plan.samePairsAllStays}
            onChange={(on) => props.onSeparate(second.key, !on)}
            accessibilityLabel={t({
              id: 'setup.premium.rooms.samePairs',
              message: `Same pairs at the ${stayName(second.type)}`,
            })}
            testID="setup-rooms-same-pairs"
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  flex: { flex: 1, minWidth: 0 },
  section: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingHorizontal: 10 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, padding: 14 },
  tabular: { fontVariant: ['tabular-nums'] },
});
