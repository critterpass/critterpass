/**
 * Once a year (8.08): the legendary calendar. A push: glass back and the ink REMIND ME, which turns
 * reminders on for every legendary still to find (off again when all are on); the month strip
 * (your trip's months tangerine, legendary months sun); a row per legendary with its date tile and
 * gold silhouette, your dates ringed. A row opens where and how to meet it.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { goBackOr } from '@/lib/navigation/back';
import {
  Banner,
  Button,
  EmptyState,
  GlassIconButton,
  LoadingCritter,
  PressableScale,
  Tag,
  Text,
  usePremiumTheme,
  useToast,
} from '@/ui/premium';

import { artKind } from '../../art-kind';
import {
  anyLabel,
  emptyBody,
  emptyTitle,
  found as foundWord,
  hereCount,
  inboxOnly,
  intro,
  monthNarrow,
  monthShort,
  part,
  remindersOn,
  remindersSet,
  remindMe,
  title,
  yourDates,
} from '../../legendary/legendary-copy';
import type { LegendaryItem } from '../../legendary/legendary-model';
import { useLegendaryCalendar } from '../../legendary/use-legendary-calendar';
import { PASS_TAB, whereRoute } from '../../routes';
import { CritterSilhouette } from '../components/critter-silhouette';
import { FormArt } from '../components/form-art';

export function PremiumLegendaryScreen({ now = () => new Date() }: { readonly now?: () => Date }) {
  const { t } = useLingui();
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const locale = useLocale();
  const toast = useToast();
  const calendar = useLegendaryCalendar(now);
  const back = () => goBackOr(PASS_TAB);

  const onRemind = () => {
    const turnedOn = calendar.toggleAll();
    if (turnedOn > 0) toast.show({ kind: 'done', message: remindersSet(turnedOn) });
  };

  return (
    <View
      style={[styles.fill, { backgroundColor: theme.color.ground }]}
      testID="critters-legendaries"
    >
      <View style={[styles.topRow, { paddingTop: insets.top + 6 }]}>
        <GlassIconButton
          icon="back"
          label={t({ id: 'critters.back', message: 'Back' })}
          onPress={back}
          testID="critters-legendaries-back"
        />
        {calendar.items.length === 0 ? null : (
          <Button
            alignSelf="auto"
            label={calendar.allReminded ? remindersOn() : remindMe()}
            variant={calendar.allReminded ? 'control' : 'primary'}
            size="small"
            onPress={onRemind}
            testID="critters-legendaries-remind"
          />
        )}
      </View>
      {!calendar.loaded ? (
        <View style={[styles.fill, styles.center]}>
          <LoadingCritter label={t({ id: 'critters.loading', message: 'Loading the critter' })} />
        </View>
      ) : calendar.items.length === 0 ? (
        <EmptyState
          title={emptyTitle()}
          line={emptyBody()}
          check={false}
          action={
            <Button
              label={t({ id: 'critters.premium.backToDex', message: 'Back to the Critterdex' })}
              variant="secondary"
              onPress={back}
            />
          }
        />
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
          <Text variant="display" accessibilityRole="header">
            {title()}
          </Text>
          <Text variant="caption" tone="muted" style={styles.intro}>
            {intro()}
          </Text>
          {calendar.notificationsOff ? (
            <View style={styles.banner}>
              <Banner tone="info" text={inboxOnly()} />
            </View>
          ) : null}
          <View style={styles.strip} accessibilityRole="summary">
            {calendar.months.map((m) => (
              <View
                key={m.month}
                accessibilityLabel={monthShort(m.month, locale)}
                style={[
                  styles.month,
                  {
                    backgroundColor: m.inTrip
                      ? theme.accent.tangerine
                      : m.legendary
                        ? theme.accent.sun
                        : theme.color.card,
                  },
                ]}
              >
                <Text variant="badge" tone={m.inTrip || m.legendary ? 'onAccent' : 'ink'}>
                  {monthNarrow(m.month, locale)}
                </Text>
              </View>
            ))}
          </View>
          <View style={styles.rows}>
            {calendar.items.map((item) => (
              <LegendRow
                key={item.windowId}
                item={item}
                onPress={() => router.push(whereRoute(item.formId))}
                foundLabel={foundWord()}
                yourDatesLabel={yourDates()}
              />
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function dateTile(item: LegendaryItem, locale: string): { top: string; bottom: string } {
  switch (item.label.kind) {
    case 'any':
      return anyLabel();
    case 'part':
      return { top: monthShort(item.label.month, locale), bottom: part(item.label.part) };
    case 'range':
      return { top: monthShort(item.label.month, locale), bottom: item.label.days };
  }
}

function LegendRow({
  item,
  onPress,
  foundLabel,
  yourDatesLabel,
}: {
  readonly item: LegendaryItem;
  readonly onPress: () => void;
  readonly foundLabel: string;
  readonly yourDatesLabel: string;
}) {
  const theme = usePremiumTheme();
  const locale = useLocale();
  const tile = dateTile(item, locale);
  const kind = item.critterKey === null ? 'gecko' : artKind(item.critterKey);
  const name = item.name ?? item.placeLine;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}. ${tile.top} ${tile.bottom}. ${item.placeLine}`}
      testID={`critters-legendary-${item.windowId}`}
      style={[
        styles.row,
        { backgroundColor: theme.color.card, boxShadow: theme.shadow.card },
        item.onYourDates ? { borderWidth: 2, borderColor: theme.accent.sun } : null,
      ]}
    >
      <View style={[styles.tile, { backgroundColor: theme.color.status.maybe.bg }]}>
        <Text variant="tier" color={theme.color.status.maybe.text}>
          {tile.top.toLocaleUpperCase(locale)}
        </Text>
        <Text variant="stepperValue" numberOfLines={1}>
          {tile.bottom}
        </Text>
      </View>
      <View style={styles.rowText}>
        <Text variant="rowTitle" numberOfLines={1}>
          {name}
        </Text>
        <Text variant="captionMuted" tone="muted" numberOfLines={2}>
          {item.copresence === null
            ? item.placeLine
            : `${item.placeLine} · ${hereCount(item.copresence.here, item.copresence.needed)}`}
        </Text>
      </View>
      {item.onYourDates && !item.found ? (
        <Tag label={yourDatesLabel} rotate={4} />
      ) : item.found ? (
        <Text variant="badge" color={theme.color.status.booked.text}>
          {foundLabel}
        </Text>
      ) : null}
      {item.found ? (
        <FormArt kind={kind} name={name} size={42} seed={item.seed} />
      ) : (
        <CritterSilhouette kind={kind} label={name} size={42} rarity="legendary" seed={item.seed} />
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  content: { paddingHorizontal: 20, paddingTop: 16 },
  intro: { marginTop: 8 },
  banner: { marginTop: 12 },
  strip: { flexDirection: 'row', gap: 3, marginTop: 20 },
  month: { flex: 1, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  rows: { gap: 8, marginTop: 14 },
  row: {
    borderRadius: 20,
    paddingVertical: 9,
    paddingLeft: 9,
    paddingRight: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tile: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 2 },
});
