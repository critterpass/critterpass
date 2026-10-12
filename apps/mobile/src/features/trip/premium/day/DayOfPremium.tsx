/**
 * One day of the trip (6.04 the leave-by, 6.05 a free day). The hero holds the one number: when
 * to leave (or the first or next stop); the card rising over it says the pickup and who is up yet
 * (the not-up wear a dashed ring), with "I'm up" and how the alarm will ring. Then running late,
 * Go, the pack list, the day's stops, and the ways on (the day plan, offline, tomorrow, today).
 * Every tap queues, so the page works the same with no signal.
 */
import { useLingui } from '@lingui/react/macro';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import {
  Banner,
  Button,
  OfflinePill,
  Skeleton,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { heroCopy } from '../../day-of/day-of-copy';
import { useDayOf, type DayOfProps } from '../../day-of/use-day-of';
import { DayHero } from './DayHero';
import { Readiness, Stops } from './DayCards';
import { PackRow } from './PackRow';

const LATE_STEPS = [10, 20, 30] as const;

function Body({ props }: { readonly props: DayOfProps }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const insets = useSafeAreaInsets();
  const view = props.leaveBy;
  const lead = props.firstUp;
  const copy = view === null ? null : heroCopy(view, props.now, props.guideName, locale);
  const hero =
    copy !== null
      ? { label: copy.label, big: copy.time, spoken: copy.spokenTime, words: false }
      : lead === null
        ? {
            label: null,
            big: t({ id: 'trip.dayOf.premium.freeTitle', message: 'A free day, on purpose' }),
            words: true,
          }
        : lead.kind === 'done'
          ? {
              label: null,
              big: t({ id: 'trip.dayOf.done', message: "That's everything on today's plan." }),
              words: true,
            }
          : {
              label:
                lead.kind === 'next'
                  ? t({ id: 'trip.dayOf.nextUp', message: 'Next up' })
                  : t({ id: 'trip.dayOf.firstUp', message: 'First up' }),
              big: lead.time,
              words: false,
            };
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={{ paddingBottom: insets.bottom + 40, gap: th.space.gap16 }}
    >
      <DayHero
        media={props.heroMedia ?? null}
        eyebrow={props.eyebrow}
        forecast={props.forecast}
        onForecast={props.onForecast}
        label={hero.label}
        big={hero.big}
        {...(hero.spoken === undefined ? {} : { spoken: hero.spoken })}
        words={hero.words}
      />
      <View style={[styles.rise, { paddingHorizontal: th.space.gutter, gap: th.space.gap10 }]}>
        {props.offline ? <OfflinePill /> : null}
        {view !== null ? (
          <Readiness props={props} />
        ) : lead !== null && lead.kind !== 'done' ? (
          <View
            style={[
              styles.card,
              {
                borderRadius: th.radius.cardRow,
                backgroundColor: th.color.card,
                boxShadow: th.shadow.card,
              },
            ]}
          >
            <Text variant="title">{lead.title}</Text>
          </View>
        ) : (
          <View
            style={[
              styles.card,
              {
                borderRadius: th.radius.cardRow,
                backgroundColor: th.color.card,
                boxShadow: th.shadow.card,
              },
            ]}
          >
            <Text variant="body" tone="inkSecondary">
              {lead === null
                ? t({ id: 'trip.dayOf.freeDay', message: 'Nothing planned today. A free day.' })
                : t({
                    id: 'trip.dayOf.premium.doneLine',
                    message: 'Rest up. Tomorrow is on the plan.',
                  })}
            </Text>
          </View>
        )}
        {props.alarmNote === null ? null : (
          <Banner
            tone="guide"
            text={props.alarmNote.text}
            {...(props.alarmNote.action === undefined ? {} : { action: props.alarmNote.action })}
            testID="trip-day-alarm-note"
          />
        )}
      </View>
      {props.late === null ? null : (
        <View
          style={[styles.lateRow, { paddingHorizontal: th.space.gutter }]}
          testID="trip-day-late"
        >
          <Text variant="label" tone="muted">
            {t({ id: 'trip.dayOf.premium.late', message: 'Running late?' })}
          </Text>
          {LATE_STEPS.map((minutes) => (
            <Button
              key={minutes}
              label={t({ id: 'trip.dayOf.premium.lateBy', message: `+${minutes} min` })}
              size="small"
              variant="floating"
              onPress={() => props.late?.(minutes)}
              testID={`trip-day-late-${minutes}`}
            />
          ))}
        </View>
      )}
      {props.onGo === undefined ? null : (
        <View style={{ paddingHorizontal: th.space.gutter, gap: th.space.gap4 }}>
          <Button
            label={t({ id: 'trip.dayOf.premium.go', message: 'Go' })}
            onPress={props.onGo}
            testID="trip-day-go"
          />
          {props.goDetail == null ? null : (
            <Text variant="captionMuted" tone="muted" align="center">
              {props.goDetail}
            </Text>
          )}
        </View>
      )}
      <PackRow
        chips={props.pack}
        onToggle={props.onTogglePack}
        onAdd={props.onAddPack}
        onRemove={props.onRemovePack}
      />
      <Stops props={props} />
      <View style={styles.links}>
        {props.onDayPlan === undefined ? null : (
          <TextButton
            label={t({ id: 'trip.dayOf.toDayPlan', message: 'See the day plan' })}
            onPress={props.onDayPlan}
            testID="trip-day-plan"
          />
        )}
        {props.onTomorrow === undefined ? null : (
          <TextButton
            label={t({ id: 'trip.dayOf.toTomorrow', message: 'See tomorrow' })}
            onPress={props.onTomorrow}
            testID="trip-day-tomorrow"
          />
        )}
        {props.onToday === undefined ? null : (
          <TextButton
            label={t({ id: 'trip.dayOf.toToday', message: 'Back to today' })}
            onPress={props.onToday}
            testID="trip-day-today"
          />
        )}
        {props.onOffline === undefined ? null : (
          <TextButton
            label={t({ id: 'trip.dayOf.toOffline', message: 'What works with no signal' })}
            onPress={props.onOffline}
            testID="trip-day-offline"
          />
        )}
      </View>
    </ScrollView>
  );
}

export function DayOfPremium({ tripId, date }: { readonly tripId: string; readonly date: string }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const day = useDayOf(tripId, date);
  return (
    <PushScreen
      title={day.props.eyebrow}
      backLabel={t({ id: 'trip.dayOf.back', message: 'Trip' })}
      headerless
      scroll={false}
      testID="trip-day"
    >
      {day.props.state === 'loading' ? (
        <View style={{ padding: th.space.gutter, gap: th.space.gap12, paddingTop: 120 }}>
          <Skeleton height={200} radius={th.radius.cardLarge} />
          <Skeleton height={120} radius={th.radius.cardRow} />
        </View>
      ) : (
        <Body props={day.props} />
      )}
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  rise: { marginTop: -46 },
  card: { padding: 16, gap: 12 },
  lateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  links: { alignItems: 'center', gap: 4 },
});
