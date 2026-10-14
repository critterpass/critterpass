/**
 * Running late (6.08): the map with the place and your dot under a light fade, the glass back and
 * the ink ETA chip, then a sheet rising from the middle: "+25 min late" large, the guide's why,
 * the options as cards (the picked one ringed in ink, a supplier's answer as a chip) and the
 * docked verb. Whoever waits is told who is late and when it now starts. Back changes nothing.
 */
import { format } from '@cp/i18n';
import type { LateOptionKind } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { Marker, type CameraRef } from '@maplibre/maplibre-react-native';
import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { lateStep, PremiumMapCanvas, StayFlag } from '@/features/plan';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  Button,
  EmptyState,
  GlassIconButton,
  PressableScale,
  ring,
  Skeleton,
  StatusTag,
  Text,
  usePremiumTheme,
} from '@/ui/premium';
import { StatusBarGround } from '@/ui/premium/shell';

import {
  ctaLabel,
  lateLines,
  optionDetail,
  optionTitle,
  vendorChip,
} from '../../disruptions/late/copy';
import { initialSelection } from '../../disruptions/late/model';
import { SaidLateScreen } from '../../disruptions/late/said-late-screen';
import { useKnownLate, type LateScene } from '../../disruptions/late/use-known-late';

function KnownLatePremium({ id }: { readonly id: string }) {
  return <LateScenePremium late={useKnownLate(id)} />;
}

/** One running-late scene: a lateness the server opened, or one the traveller is saying now. */
export function LateScenePremium({ late }: { readonly late: LateScene }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const insets = useSafeAreaInsets();
  const camera = useRef<CameraRef>(null);
  const p = late.props;
  const [picked, setPicked] = useState<LateOptionKind | null>(null);
  const lines = lateLines();
  const model = p.model;
  if (p.state !== 'ready' || model === null) {
    return (
      <View
        style={[styles.root, { backgroundColor: th.color.ground, paddingTop: insets.top + 60 }]}
        testID="late-screen"
      >
        <View style={[styles.back, { top: insets.top + th.space.gap6, left: th.space.gutter }]}>
          <GlassIconButton
            icon="back"
            label={lines.backAction}
            onPress={p.onBack}
            testID="late-back"
          />
        </View>
        {p.state === 'loading' ? (
          <View style={{ padding: th.space.gutter }}>
            <Skeleton height={200} radius={th.radius.cardLarge} />
          </View>
        ) : (
          <EmptyState title={lines.missingTitle} line={lines.missing} />
        )}
      </View>
    );
  }
  const selected = picked ?? initialSelection(model);
  const option = model.options.find((o) => o.id === selected) ?? null;
  const settled = selected !== null && selected === model.chosen;
  const minutes = model.lateMin;
  const eta = model.eta;
  const who = format.list(locale, [...p.lateNames], { type: 'conjunction' });
  const { title, start } = model;
  const place = late.place;
  return (
    <View style={styles.root} testID="late-screen">
      <View style={styles.map}>
        {place === undefined || late.offline ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: th.color.control }]} />
        ) : (
          <PremiumMapCanvas
            cameraRef={camera}
            initialCenter={[place.lng, place.lat]}
            initialZoom={14}
            destinationSlug={late.destinationSlug}
            still
          >
            <StayFlag
              lngLat={[place.lng, place.lat]}
              label={place.name}
              accessibilityLabel={place.name}
            />
            {late.fix === null ? null : (
              <Marker lngLat={[late.fix.lng, late.fix.lat]} anchor="center">
                <View
                  style={[
                    styles.you,
                    { backgroundColor: th.accent.sky, boxShadow: ring(3, th.accent.paper) },
                  ]}
                />
              </Marker>
            )}
          </PremiumMapCanvas>
        )}
      </View>
      {/* The clock and battery sit on a fade of the ground, not straight on the map's labels. */}
      <StatusBarGround />
      <View
        style={[
          styles.header,
          { top: insets.top + th.space.gap6, paddingHorizontal: th.space.gutter },
        ]}
      >
        <GlassIconButton
          icon="back"
          label={lines.backAction}
          onPress={p.onBack}
          testID="late-back"
        />
        {model.open ? (
          <View style={[styles.eta, { backgroundColor: th.color.inkSurface }]} testID="late-eta">
            <Text variant="caption" color={th.color.onInkSurface}>
              {model.stale
                ? t({ id: 'trip.disruptions.late.etaStale', message: `Last ETA ${eta}` })
                : t({ id: 'trip.disruptions.late.eta', message: `ETA ${eta}` })}
            </Text>
          </View>
        ) : null}
      </View>
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: th.color.ground,
            paddingBottom: insets.bottom + 16,
            boxShadow: th.shadow.toast,
          },
        ]}
      >
        <View style={[styles.grabber, { backgroundColor: th.color.outlineEmpty }]} />
        <ScrollView
          contentContainerStyle={{ gap: th.space.gap12, paddingHorizontal: th.space.gutter }}
        >
          <Text variant="label" tone="muted">{`${title} · ${start}`}</Text>
          {place === undefined || late.offline ? (
            <Text variant="captionMuted" tone="muted" testID="late-no-map">
              {lines.offlineMap}
            </Text>
          ) : null}
          {!model.open ? (
            <Text variant="title" testID="late-on-time">
              {lines.onTime}
            </Text>
          ) : model.role === 'late' ? (
            <>
              <Text variant="hero" testID="late-title" adjustsFontSizeToFit numberOfLines={1}>
                {t({ id: 'trip.disruptions.late.chip', message: `+${minutes} min` })}
              </Text>
              <Text variant="rowText" tone="inkSecondary">
                {p.reason}
              </Text>
              {model.options.map((o) => {
                const on = selected === o.id;
                const vendor = o.id === 'push' ? model.vendor : null;
                return (
                  <PressableScale
                    key={o.id}
                    onPress={() => setPicked(o.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    testID={`late-option-${o.id}`}
                  >
                    <View
                      style={[
                        styles.option,
                        {
                          borderRadius: th.radius.banner,
                          backgroundColor: th.color.card,
                          boxShadow: on
                            ? [ring(2, th.color.ink), th.shadow.card].join(', ')
                            : th.shadow.card,
                        },
                      ]}
                    >
                      <Text variant="rowTitle">{optionTitle(o)}</Text>
                      <Text variant="caption" tone="muted">
                        {p.details?.[o.id] ?? optionDetail(o, locale)}
                      </Text>
                      {vendor === null ? null : (
                        <StatusTag
                          label={vendorChip(vendor.name, vendor.status, locale)}
                          tone="booked"
                        />
                      )}
                    </View>
                  </PressableScale>
                );
              })}
              <Button
                label={settled ? lines.chosen : ctaLabel(option)}
                disabled={option === null || settled}
                loading={p.sending}
                onPress={() => {
                  if (option !== null && !settled) p.onChoose(option.id);
                }}
                testID="late-choose"
              />
            </>
          ) : (
            <>
              <Text variant="title" testID="late-waiting-title">
                {t({
                  id: 'trip.disruptions.late.waitingTitle',
                  message: `${who}: ${minutes} min late`,
                })}
              </Text>
              <Text variant="rowText" tone="inkSecondary">
                {t({
                  id: 'trip.disruptions.late.waitingLine',
                  message: `${title} starts ${start} for you.`,
                })}
              </Text>
            </>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

/** The route's screen: a known lateness by its id, or one the traveller is saying right now. */
export function RunningLatePremium({ id }: { readonly id: string }) {
  const said = useLocalSearchParams<{ tripId?: string; stop?: string; minutes?: string }>();
  if (said.tripId && said.stop) {
    return (
      <SaidLateScreen
        tripId={said.tripId}
        stableId={said.stop}
        minutes={lateStep(said.minutes)}
        known={(open) => <KnownLatePremium id={open} />}
        render={(scene) => <LateScenePremium late={scene} />}
      />
    );
  }
  return <KnownLatePremium id={id} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  map: { height: 380 },
  back: { position: 'absolute', zIndex: 2 },
  header: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  eta: { height: 32, borderRadius: 12, paddingHorizontal: 12, justifyContent: 'center' },
  sheet: {
    flex: 1,
    marginTop: -40,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingTop: 8,
    gap: 8,
  },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3 },
  option: { padding: 14, gap: 4 },
  you: { width: 16, height: 16, borderRadius: 8 },
});
