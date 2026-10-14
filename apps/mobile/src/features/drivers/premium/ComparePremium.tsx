/**
 * Compare (6.23): the shortlist side by side on equal terms in one table card (a day price, what
 * each person pays, car and seats, languages, tolls and entry, overtime, licence), the guide's note
 * naming the biggest risk, and a Pick button per driver docked at the bottom. More than three
 * drivers scroll sideways, and their Pick buttons sit under their columns.
 */
import { useLingui } from '@lingui/react/macro';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { guideCritterKind } from '@/features/trip';
import { Button, GuideNote, LoadingCritter, Text, TextButton, usePremiumTheme } from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { useCompare } from '../compare/use-compare';
import type { DriversApi } from '../shared/api';
import { CompareTable, KEY_COLUMN, TABLE_GAP } from './components/CompareTable';

const CARD_PADDING = 12;
const MIN_COLUMN = 88;

export function ComparePremium(props: {
  readonly tripId: string;
  readonly days?: string;
  readonly api?: DriversApi;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const insets = useSafeAreaInsets();
  const screen = useWindowDimensions().width;
  const compare = useCompare(props.tripId, props.days, props.api);
  const { plan, state, drivers } = compare;
  const back = t({ id: 'drivers.premium.shortlist', message: 'Shortlist' });
  const title = t({ id: 'drivers.premium.compareTitle', message: `Compare ${drivers.length}` });
  if (
    state.kind === 'loading' ||
    state.kind === 'error' ||
    (state.kind === 'offline' && state.data === null)
  ) {
    return (
      <PushScreen largeTitle title={title} backLabel={back} testID="drivers-compare-loading">
        {state.kind === 'loading' ? (
          <LoadingCritter
            label={t({ id: 'drivers.compare.loading', message: 'Loading the shortlist' })}
          />
        ) : (
          <View
            style={[styles.failed, { padding: th.space.gutter }]}
            testID="drivers-compare-failed"
          >
            <Text variant="body" tone="muted" align="center">
              {state.kind === 'offline'
                ? t({
                    id: 'drivers.premium.offline',
                    message: 'This needs signal. Try again when you have some.',
                  })
                : t({ id: 'drivers.premium.failed', message: "That didn't load. Try again." })}
            </Text>
            <Button
              label={t({ id: 'drivers.premium.retry', message: 'Try again' })}
              variant="secondary"
              onPress={() => void compare.refresh()}
              testID="drivers-compare-retry"
            />
          </View>
        )}
      </PushScreen>
    );
  }
  // Nobody on the shortlist: say so and lead back to the drivers, never an empty table.
  if (drivers.length === 0) {
    return (
      <PushScreen
        largeTitle
        title={t({ id: 'drivers.premium.compareNoneTitle', message: 'Compare' })}
        subtitle={compare.header}
        backLabel={back}
        testID="drivers-compare-empty"
      >
        <View style={[styles.failed, { padding: th.space.gutter }]}>
          <Text variant="body" tone="muted" align="center">
            {t({
              id: 'drivers.premium.compareNone',
              message:
                'Nobody on the shortlist yet. Save two or three drivers to compare them here.',
            })}
          </Text>
          <Button
            label={t({ id: 'drivers.premium.compareFind', message: 'Find drivers' })}
            variant="secondary"
            onPress={compare.addAnother}
            testID="drivers-compare-add"
          />
        </View>
      </PushScreen>
    );
  }
  const shown = Math.max(1, Math.min(3, drivers.length));
  const room = screen - 2 * th.space.gutter - 2 * CARD_PADDING - KEY_COLUMN - shown * TABLE_GAP;
  const column = Math.max(MIN_COLUMN, Math.floor(room / shown));
  const docked = drivers.length <= 3;
  // The driver with the fewest lines unsaid is the one the footer leads with.
  const lead = compare.missing.indexOf(Math.min(...compare.missing));
  const pick = (index: number, flex?: number) => {
    const driver = drivers[index];
    if (driver === undefined) return null;
    return (
      <View key={driver.id} style={flex === undefined ? { width: column } : { flex }}>
        <Button
          label={t({ id: 'drivers.premium.pick', message: `Pick ${driver.name}` })}
          size={docked ? 'large' : 'small'}
          variant={index === lead ? 'primary' : 'floating'}
          onPress={() => compare.pick(driver.id)}
          testID={`drivers-compare-pick-${driver.id}`}
        />
      </View>
    );
  };
  return (
    <PushScreen
      largeTitle
      title={title}
      subtitle={compare.header}
      backLabel={back}
      scroll={false}
      testID="drivers-compare"
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.body,
          {
            paddingHorizontal: th.space.gutter,
            gap: th.space.gap12,
            paddingBottom: insets.bottom + (docked ? 96 : 32),
          },
        ]}
      >
        {drivers.length > 3 ? (
          <Text variant="caption" tone="muted" testID="drivers-compare-more">
            {t({ id: 'drivers.compare.more', message: 'Swipe sideways for the rest →' })}
          </Text>
        ) : null}
        <View
          style={{
            borderRadius: th.radius.cardLarge,
            backgroundColor: th.color.card,
            boxShadow: th.shadow.card,
            padding: CARD_PADDING,
            paddingBottom: 6,
          }}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false} scrollEnabled={!docked}>
            <View style={{ gap: th.space.gap8 }}>
              <CompareTable
                drivers={drivers}
                missing={compare.missing}
                rows={compare.rows}
                column={column}
              />
              {docked ? null : (
                <View style={styles.pickRow}>
                  <View style={{ width: KEY_COLUMN }} />
                  {drivers.map((_, index) => pick(index))}
                </View>
              )}
            </View>
          </ScrollView>
        </View>
        {compare.risk === null ? null : (
          <GuideNote
            name={plan.guide.name}
            critter={guideCritterKind(plan.guide.id)}
            text={compare.risk}
            testID="drivers-compare-risk"
          />
        )}
        {drivers.length < 2 ? (
          <View style={styles.center}>
            <TextButton
              label={t({ id: 'drivers.compare.addAnother', message: 'Add another to compare' })}
              onPress={compare.addAnother}
              testID="drivers-compare-add"
            />
          </View>
        ) : null}
      </ScrollView>
      {docked && drivers.length > 0 ? (
        <View
          style={[
            styles.footer,
            { bottom: insets.bottom + 12, left: th.space.gutter, right: th.space.gutter },
          ]}
        >
          {drivers.map((_, index) => pick(index, index === lead ? 1.2 : 1))}
        </View>
      ) : null}
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 8 },
  failed: { gap: 12 },
  pickRow: { flexDirection: 'row', gap: TABLE_GAP, paddingBottom: 6 },
  center: { alignItems: 'center' },
  footer: { position: 'absolute', flexDirection: 'row', gap: 8 },
});
