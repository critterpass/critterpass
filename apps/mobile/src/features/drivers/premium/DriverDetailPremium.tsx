/**
 * A listed driver (6.20): a band in his colour with his initial large and the "Runs his own
 * listing" sticker, his name, "Driver · Ubud", three stats (crews loved it, trips, listed since),
 * the car, languages and areas, his own price note, one tip from a crew in the guide's yellow, then
 * "Message on WhatsApp" and "Shortlist" docked. Reports ask once.
 */
import { format } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { crewAccent, turn } from '@/features/trip';
import { useLocale } from '@/lib/i18n/use-locale';
import { Button, LoadingCritter, Tag, Text, TextButton, usePremiumTheme } from '@/ui/premium';
import { confirmAlert, PushScreen } from '@/ui/premium/shell';

import { useVehicleLine } from '../shared/vehicle-line';
import { useDriverDetail, type DriverReport } from '../directory/use-driver-detail';

/* eslint-disable lingui/no-unlocalized-strings -- report kinds the moderation queue takes, not copy. */
const REPORT = { listing: 'driver_listing', tip: 'driver_tip' } as const;
/* eslint-enable lingui/no-unlocalized-strings */

export function DriverDetailPremium(input: {
  readonly tripId: string;
  readonly listingId: string;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const insets = useSafeAreaInsets();
  const detail = useDriverDetail(input.tripId, input.listingId);
  const { driver } = detail;
  const car = useVehicleLine(driver ?? { vehicle: null, seats: null });
  const back = t({ id: 'drivers.detail.back', message: "Crews' drivers" });
  if (driver === null) {
    return (
      <PushScreen
        title={back}
        backLabel={back}
        testID={detail.failed ? 'drivers-detail-unavailable' : 'drivers-detail-loading'}
      >
        {detail.failed ? (
          <Text variant="body" tone="muted" align="center" style={{ padding: th.space.gutter }}>
            {t({
              id: 'drivers.detail.unavailable',
              message: "This driver's listing isn't available right now. He may have paused it.",
            })}
          </Text>
        ) : (
          <LoadingCritter
            label={t({ id: 'drivers.premium.loadingDriver', message: 'Getting his listing…' })}
          />
        )}
      </PushScreen>
    );
  }
  const loved = driver.crews_loved ?? 0;
  const rated = driver.crews_rated ?? 0;
  const crewSize = driver.tip?.crew_size ?? 0;
  const tipMonth =
    driver.tip === null
      ? ''
      : format.date(locale, new Date(driver.tip.month), { month: 'long', year: 'numeric' });
  const stats = [
    ...(rated > 0
      ? [
          {
            value: t({ id: 'drivers.detail.lovedValue', message: `${loved} of ${rated}` }),
            label: t({ id: 'drivers.detail.loved', message: 'Crews loved it' }),
          },
        ]
      : []),
    {
      value: String(driver.trips),
      label: t({ id: 'drivers.detail.trips', message: 'Trips with crews' }),
    },
    {
      value: driver.listed_at.slice(0, 4),
      label: t({ id: 'drivers.detail.since', message: 'Listed since' }),
    },
  ];
  const facts = [car, driver.languages.join(', '), driver.areas.join(', ')].filter(
    (line): line is string => line !== null && line !== '',
  );
  const ask = (target: DriverReport) =>
    void confirmAlert({
      title: t({ id: 'drivers.report.title', message: 'Report this?' }),
      message: t({
        id: 'drivers.report.line',
        message: 'Our team reviews it. Nobody sees who reported it.',
      }),
      confirm: t({ id: 'drivers.report.confirm', message: 'Report' }),
      cancel: t({ id: 'drivers.premium.cancel', message: 'Cancel' }),
    }).then((yes) => {
      if (yes) detail.onReport(target);
    });
  return (
    <PushScreen
      title={driver.display_name}
      backLabel={back}
      headerless
      scroll={false}
      testID="drivers-detail"
    >
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 120, gap: th.space.gap14 }}
      >
        <View
          style={[
            styles.band,
            { backgroundColor: crewAccent(driver.id.length), paddingTop: insets.top + 60 },
          ]}
        >
          <Text variant="hero" color={th.color.onAccent}>
            {driver.display_name.slice(0, 1).toUpperCase()}
          </Text>
          <View style={{ transform: [turn(-5)] }}>
            <Tag
              label={t({ id: 'drivers.detail.own', message: 'Runs his own listing' })}
              color={th.accent.mint}
            />
          </View>
        </View>
        <View style={{ paddingHorizontal: th.space.titleGutter, gap: th.space.gap4 }}>
          <Text variant="largeTitle" accessibilityRole="header">
            {driver.display_name}
          </Text>
          <Text variant="rowText" tone="muted">
            {`${t({ id: 'drivers.card.role', message: 'Driver' })} · ${driver.areas[0] ?? ''}`}
          </Text>
        </View>
        <View
          style={[
            styles.stats,
            {
              marginHorizontal: th.space.gutter,
              borderRadius: th.radius.card,
              backgroundColor: th.color.card,
              boxShadow: th.shadow.card,
            },
          ]}
        >
          {stats.map((stat) => (
            <View key={stat.label} style={styles.stat}>
              <Text variant="title">{stat.value}</Text>
              <Text variant="captionMuted" tone="muted" align="center">
                {stat.label}
              </Text>
            </View>
          ))}
        </View>
        {facts.length === 0 ? null : (
          <View
            style={[
              styles.card,
              {
                marginHorizontal: th.space.gutter,
                borderRadius: th.radius.card,
                backgroundColor: th.color.card,
                boxShadow: th.shadow.card,
              },
            ]}
          >
            {facts.map((fact) => (
              <Text key={fact} variant="rowTextStrong">
                {fact}
              </Text>
            ))}
            {driver.price_text === null ? null : (
              <>
                <Text variant="rowText">{driver.price_text}</Text>
                <Text variant="captionMuted" tone="muted">
                  {t({
                    id: 'drivers.detail.priceNote',
                    message: 'What he tells crews. Not a CritterPass price.',
                  })}
                </Text>
              </>
            )}
          </View>
        )}
        {driver.tip === null ? null : (
          <View
            style={[
              styles.card,
              {
                marginHorizontal: th.space.gutter,
                borderRadius: th.radius.banner,
                backgroundColor: th.color.banner.guide.bg,
              },
            ]}
          >
            <Text variant="rowText" color={th.color.banner.guide.text} style={styles.italic}>
              {driver.tip.text}
            </Text>
            <Text variant="captionMuted" color={th.color.banner.guide.text}>
              {t({ id: 'drivers.detail.tipBy', message: `A crew of ${crewSize} · ${tipMonth}` })}
            </Text>
            <TextButton
              label={t({ id: 'drivers.detail.reportTip', message: 'Report this tip' })}
              onPress={() => {
                if (driver.tip !== null) ask({ kind: REPORT.tip, id: driver.tip.id });
              }}
              testID="drivers-report-tip"
            />
          </View>
        )}
        <View style={styles.center}>
          <TextButton
            label={t({ id: 'drivers.detail.report', message: 'Report this listing' })}
            onPress={() => ask({ kind: REPORT.listing, id: driver.id })}
            testID="drivers-report"
          />
        </View>
      </ScrollView>
      <View
        style={[
          styles.foot,
          {
            paddingBottom: insets.bottom + 12,
            paddingHorizontal: th.space.titleGutter,
            backgroundColor: th.color.ground,
          },
        ]}
      >
        <View style={styles.wide}>
          <Button
            label={t({ id: 'drivers.detail.message', message: 'Message on WhatsApp' })}
            onPress={detail.onMessage}
            testID="drivers-message"
          />
        </View>
        <View style={styles.flex}>
          <Button
            label={
              detail.shortlisted
                ? t({ id: 'drivers.detail.shortlisted', message: 'On your trip' })
                : t({ id: 'drivers.premium.shortlist', message: 'Shortlist' })
            }
            variant="secondary"
            disabled={detail.shortlisted}
            loading={detail.shortlisting}
            onPress={detail.onShortlist}
            testID="drivers-shortlist"
          />
        </View>
      </View>
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  band: {
    minHeight: 240,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingBottom: 20,
  },
  stats: { flexDirection: 'row', paddingVertical: 14 },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  card: { padding: 14, gap: 6 },
  italic: { fontStyle: 'italic' },
  center: { alignItems: 'center' },
  foot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 8,
    paddingTop: 12,
  },
  wide: { flex: 1.5 },
  flex: { flex: 1 },
});
