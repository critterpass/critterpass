/**
 * Find a driver (6.19): which legs (the day chips, picked in ink with a mint check; "+ Day" adds
 * one), then where the driver comes from, one card each: a private tour, one you found yourself,
 * the guide's post to ask in the local groups, the drivers our crews used. Our drivers (rate,
 * invite) under them. One shortlist per trip across every source docks as an ink bar with Compare.
 */
import { useLingui } from '@lingui/react/macro';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { guideCritterKind } from '@/features/trip';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  Button,
  CritterSticker,
  Icon,
  PressableScale,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { useFindDriver } from '../find/use-find-driver';
import { dayLabel } from '../shared/format';
import { ShortlistBar, Source } from './components/FindDriverParts';

export function FindDriverPremium({
  tripId,
  days,
}: {
  readonly tripId: string;
  readonly days?: string;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const insets = useSafeAreaInsets();
  const find = useFindDriver(tripId, days);
  const { plan, first } = find;
  const back =
    first === null
      ? t({ id: 'drivers.back.trip', message: 'Trip' })
      : `${dayLabel(first.date, locale)}`;
  return (
    <PushScreen
      title={t({ id: 'drivers.find.title', message: 'Find a driver' })}
      subtitle={back}
      backLabel={back}
      scroll={false}
      testID="drivers-find"
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.body,
          {
            paddingHorizontal: th.space.gutter,
            gap: th.space.gap12,
            paddingBottom: insets.bottom + 120,
          },
        ]}
      >
        <Text variant="rowText" tone="muted">
          {t({
            id: 'drivers.find.intro',
            message:
              'Pick the legs, then where the driver comes from. You can mix sources and compare them after.',
          })}
        </Text>
        <View style={styles.chips} testID="drivers-find-legs">
          {find.shown.map((day) => {
            const on = find.picked.has(day.date);
            return (
              <PressableScale
                key={day.date}
                onPress={() => find.toggle(day.date)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                testID={`drivers-find-leg-${day.date}`}
              >
                <View
                  style={[
                    styles.day,
                    on
                      ? { backgroundColor: th.color.ink }
                      : { backgroundColor: th.color.card, boxShadow: th.shadow.float },
                  ]}
                >
                  {on ? (
                    <View style={[styles.check, { backgroundColor: th.accent.mint }]}>
                      <Icon name="check" size={11} color={th.color.onAccent} />
                    </View>
                  ) : null}
                  <Text variant="pillSmall" color={on ? th.color.onInk : th.color.ink}>
                    {`${dayLabel(day.date, locale)} · ${day.gap?.place ?? day.theme ?? ''}`}
                  </Text>
                </View>
              </PressableScale>
            );
          })}
          {find.canAdd ? (
            <PressableScale
              onPress={find.startAdding}
              accessibilityRole="button"
              testID="drivers-find-add-day"
            >
              <View style={[styles.day, styles.dashed, { borderColor: th.color.outlineEmpty }]}>
                <Text variant="pillSmall" tone="muted">
                  {t({ id: 'drivers.find.addDay', message: '+ Day' })}
                </Text>
              </View>
            </PressableScale>
          ) : null}
        </View>
        {plan.days.length > 0 ? null : (
          <Text variant="caption" tone="muted" testID="drivers-find-no-days">
            {plan.loaded
              ? t({
                  id: 'drivers.find.noDays',
                  message: 'No days in the plan yet. You can still line a driver up.',
                })
              : t({ id: 'drivers.find.loadingDays', message: 'Reading the plan’s days…' })}
          </Text>
        )}
        <Source
          icon="star"
          tint={th.color.status.rain}
          tilt={-6}
          title={t({ id: 'drivers.find.tours', message: 'Book a private tour' })}
          body={t({
            id: 'drivers.find.toursBody',
            message: 'Klook and Viator, fixed price per car',
          })}
          cta={t({ id: 'drivers.premium.browse', message: 'Browse' })}
          onPress={find.onTours}
          testID="drivers-find-tours"
        />
        <Source
          icon="chat"
          tint={th.color.status.voteOpen}
          tilt={5}
          title={t({ id: 'drivers.find.found', message: 'Found one yourself' })}
          body={t({
            id: 'drivers.find.foundBody',
            message: 'Paste a message, drop a screenshot, share a contact',
          })}
          cta={t({ id: 'drivers.premium.add', message: 'Add' })}
          onPress={find.onFound}
          testID="drivers-find-found"
        />
        <View
          style={[
            styles.source,
            styles.dashed,
            { borderRadius: th.radius.card, borderColor: th.color.outlineEmpty },
          ]}
        >
          <CritterSticker
            kind={guideCritterKind(plan.guide.id)}
            name={plan.guide.name}
            size={46}
            pose="think"
          />
          <View style={styles.flex}>
            <Text variant="headline">{t({ id: 'drivers.find.ask', message: 'Ask for me' })}</Text>
            <Text variant="caption" tone="muted">
              {t({
                id: 'drivers.find.askBody',
                message: `I'll write a post for the ${plan.area} groups. You post it.`,
              })}
            </Text>
          </View>
          <Button
            alignSelf="auto"
            label={t({ id: 'drivers.find.draft', message: 'Draft it' })}
            size="small"
            onPress={find.onAsk}
            testID="drivers-find-ask"
          />
        </View>
        <Source
          icon="car"
          tint={th.color.status.maybe}
          tilt={4}
          title={t({ id: 'drivers.find.directory', message: 'Drivers our crews used' })}
          body={t({
            id: 'drivers.find.directoryBody',
            message: 'Listed drivers, rated by crews who rode with them',
          })}
          cta={t({ id: 'drivers.premium.see', message: 'See' })}
          onPress={find.onDirectory}
          testID="drivers-find-directory"
        />
        <View style={styles.center}>
          <TextButton
            align="center"
            label={t({ id: 'drivers.find.ours', message: 'Our drivers: rate or invite one' })}
            onPress={find.onOurs}
            testID="drivers-find-ours"
          />
        </View>
        {find.shortlistFailed ? (
          <View style={styles.row} testID="drivers-find-shortlist-failed">
            <Text variant="caption" tone="muted" style={styles.flex}>
              {find.state.kind === 'offline'
                ? t({
                    id: 'drivers.find.shortlistOffline',
                    message: 'No signal: your shortlist shows when you’re back online.',
                  })
                : t({ id: 'drivers.find.shortlistFailed', message: 'Your shortlist didn’t load.' })}
            </Text>
            <TextButton
              label={t({ id: 'drivers.load.retry', message: 'Try again' })}
              onPress={() => void find.refresh()}
              testID="drivers-find-shortlist-retry"
            />
          </View>
        ) : null}
      </ScrollView>
      {find.shortlist.length === 0 ? null : (
        <ShortlistBar
          drivers={find.shortlist}
          bottom={insets.bottom + 12}
          onCompare={find.onCompare}
        />
      )}
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 8 },
  flex: { flex: 1, minWidth: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  day: {
    height: 34,
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 10,
    paddingRight: 12,
  },
  check: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  dashed: { borderWidth: 1.5, borderStyle: 'dashed' },
  source: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  center: { alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
