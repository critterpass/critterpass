/**
 * The SOS session map on the premium map (built from the 6.10 crew-map pieces): the person who
 * needs help as their avatar ringed in pink, this phone as the sky dot, a dotted pink line between
 * them; the glass back over the map and a card at the foot with how far it is and walking
 * directions in the phone's own maps app. Once the SOS ends the map gives way to the card alone.
 */
import { GeoJSONSource, Layer, Marker, type CameraRef } from '@maplibre/maplibre-react-native';
import { useLingui } from '@lingui/react/macro';
import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { chosenMapsApp, mapsAppFor } from '@/features/go';
import { PremiumMapCanvas } from '@/features/plan';
import { crewAccent } from '@/features/trip';
import { distanceIn } from '@/lib/i18n/formats';
import { useLocale } from '@/lib/i18n/use-locale';
import { Avatar, Button, ring, Text, usePremiumTheme } from '@/ui/premium';
import { PushScreen, StatusBarGround } from '@/ui/premium/shell';

import { PLATFORM } from '../sos/send-queries';
import { useSessionMap } from '../session-map/use-session-map';
import { walkingDirectionsUrl } from '../session-map/walking-route';

export function SessionMapPremium() {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const insets = useSafeAreaInsets();
  const locale = useLocale();
  const params = useLocalSearchParams<{ id?: string }>();
  const sosId = typeof params.id === 'string' && params.id !== '' ? params.id : null;
  const map = useSessionMap(sosId);
  const camera = useRef<CameraRef | null>(null);
  const [cardHeight, setCardHeight] = useState(0);
  const name = map.model?.senderName ?? '';
  const { sender, etaMin: eta } = map;
  const away = map.distanceM === null ? null : distanceIn(map.distanceM);
  const km =
    away === null
      ? null
      : new Intl.NumberFormat(locale, {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }).format(away.value);
  const line = map.ended
    ? t({ id: 'safety.map.ended', message: 'This SOS is over. The location share has stopped.' })
    : sender === null
      ? t({ id: 'safety.map.waiting', message: `Waiting for ${name}’s location.` })
      : eta !== null
        ? t({ id: 'safety.map.eta', message: `${eta} minutes away on foot.` })
        : km !== null && away?.unit === 'mi'
          ? t({ id: 'safety.map.distanceMiles', message: `${km} mi from you, in a straight line.` })
          : km !== null
            ? t({ id: 'safety.map.distance', message: `${km} km from you, in a straight line.` })
            : t({ id: 'safety.map.live', message: `${name}’s location is live.` });
  const title = t({ id: 'safety.sos.title', message: `${name} needs help` });
  const showMap = map.centre !== null && !map.ended;

  return (
    <PushScreen
      title={title}
      backLabel={t({ id: 'safety.premium.back', message: 'Back' })}
      headerless
      scroll={false}
      testID="sos-map-screen"
    >
      <View style={[styles.fill, { backgroundColor: th.color.ground }]}>
        {showMap && map.centre !== null ? (
          <PremiumMapCanvas
            cameraRef={camera}
            initialCenter={[map.centre.lng, map.centre.lat]}
            initialZoom={map.zoom}
            destinationSlug={map.destinationSlug}
            ornamentBottom={cardHeight + 8}
            testID="sos-map"
          >
            {map.line === null ? null : (
              <GeoJSONSource
                id="sos-line"
                data={{
                  type: 'Feature',
                  properties: {},
                  geometry: {
                    type: 'LineString',
                    coordinates: map.line.map(([lng, lat]) => [lng, lat]),
                  },
                }}
              >
                <Layer
                  id="sos-line-dots"
                  type="line"
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                  paint={{
                    'line-color': th.accent.pink,
                    'line-width': 4,
                    'line-dasharray': [0.2, 1.8],
                  }}
                />
              </GeoJSONSource>
            )}
            {sender === null ? null : (
              <Marker lngLat={[sender.lng, sender.lat]} anchor="bottom">
                <View
                  style={[
                    styles.pin,
                    { boxShadow: `${ring(6, th.color.status.voteOpen.bg)}, ${th.shadow.sticker}` },
                  ]}
                  accessibilityLabel={title}
                >
                  <Avatar
                    name={name}
                    color={crewAccent(0)}
                    uid={map.model?.senderUid}
                    size={40}
                    ringed
                  />
                </View>
              </Marker>
            )}
            {map.here === null ? null : (
              <Marker lngLat={[map.here.lng, map.here.lat]} anchor="center">
                <View
                  style={[
                    styles.you,
                    { backgroundColor: th.accent.sky, boxShadow: ring(3, th.accent.paper) },
                  ]}
                />
              </Marker>
            )}
          </PremiumMapCanvas>
        ) : null}
      </View>
      {/* The clock and battery sit on a fade of the ground, not straight on the map's labels. */}
      <StatusBarGround />
      <View
        onLayout={(event) => setCardHeight(event.nativeEvent.layout.height)}
        style={[
          styles.foot,
          { padding: th.space.gutter, paddingBottom: insets.bottom + th.space.gap16 },
        ]}
      >
        <View
          testID="sos-map-card"
          style={[
            styles.card,
            {
              borderRadius: th.radius.cardRow,
              backgroundColor: th.color.card,
              boxShadow: th.shadow.float,
              gap: th.space.gap10,
            },
          ]}
        >
          <View style={[styles.chip, { backgroundColor: th.color.status.voteOpen.bg }]}>
            <Text variant="badge" color={th.color.status.voteOpen.text}>
              {title}
            </Text>
          </View>
          <Text variant="title" testID="sos-map-line">
            {line}
          </Text>
          {map.line === null || map.ended ? null : (
            <Text variant="caption" tone="muted">
              {t({
                id: 'safety.map.straight',
                message: 'The line is straight; your maps app has the walking route.',
              })}
            </Text>
          )}
          {sender === null || map.ended ? null : (
            <Button
              label={t({ id: 'safety.map.directions', message: 'Walking directions' })}
              icon="pin"
              onPress={() =>
                void Linking.openURL(
                  walkingDirectionsUrl(
                    sender,
                    // The app picked in Settings on iPhone; Google Maps on Android.
                    mapsAppFor(
                      Platform.OS === PLATFORM.ios ? PLATFORM.ios : PLATFORM.android,
                      chosenMapsApp(),
                    ),
                  ),
                )
              }
              testID="sos-map-directions"
            />
          )}
        </View>
      </View>
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  foot: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  card: { padding: 16 },
  chip: {
    alignSelf: 'flex-start',
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  pin: { borderRadius: 24 },
  you: { width: 16, height: 16, borderRadius: 8 },
});
