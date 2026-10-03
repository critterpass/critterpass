/**
 * The SOS session map: the person who needs help, this phone, the line between them and how far
 * it is on foot, with walking directions in the phone's own maps app. Built from the shared map
 * surface; free on every trip, no teaser, and it closes with the incident.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { Card } from '@/ui/cards/Card';
import { SecondaryText } from '@/ui/cards/SecondaryText';
import { Stack } from '@/ui/layout/Stack';
import { CpMap } from '@/ui/map/CpMap';
import { BackButton } from '@/ui/shell/BackButton';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import { PLATFORM } from '../sos/send-queries';
import { useSessionMap } from './use-session-map';
import { walkingDirectionsUrl } from './walking-route';
import { distanceIn } from '@/lib/i18n/formats';

export function SessionMapScreen() {
  const { t } = useLingui();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const locale = useLocale();
  const params = useLocalSearchParams<{ id?: string }>();
  const sosId = typeof params.id === 'string' && params.id !== '' ? params.id : null;
  const map = useSessionMap(sosId);
  const [cardHeight, setCardHeight] = useState(0);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const name = map.model?.senderName ?? '';
  const sender = map.sender;
  const eta = map.etaMin;
  const away = map.distanceM === null ? null : distanceIn(map.distanceM);
  const km = away === null ? null : away.value.toFixed(1);

  const line = map.ended
    ? t({ id: 'safety.map.ended', message: 'This SOS is over. The location share has stopped.' })
    : sender === null
      ? t({ id: 'safety.map.waiting', message: `Waiting for ${name}'s location.` })
      : eta !== null
        ? t({ id: 'safety.map.eta', message: `${eta} minutes away on foot.` })
        : km !== null && away?.unit === 'mi'
          ? t({ id: 'safety.map.distanceMiles', message: `${km} mi from you, in a straight line.` })
          : km !== null
            ? t({ id: 'safety.map.distance', message: `${km} km from you, in a straight line.` })
            : t({ id: 'safety.map.live', message: `${name}'s location is live.` });

  return (
    <Scaffold variant="dark" edges={[]} testID="sos-map-screen">
      <View style={styles.fill}>
        {map.centre === null || map.ended ? null : (
          <CpMap
            places={
              sender === null
                ? []
                : [
                    {
                      id: 'sos-sender',
                      name,

                      iconKey: 'pin',
                      categoryLabel: t({ id: 'safety.map.needsHelp', message: 'Needs help' }),
                      lat: sender.lat,
                      lng: sender.lng,
                      members: [
                        { id: 'sos-sender', initial: name.slice(0, 1).toLocaleUpperCase() },
                      ],
                    },
                  ]
            }
            zoom={map.zoom}
            androidTexture
            ornamentBottom={cardHeight + 8}
            initialCenter={[map.centre.lng, map.centre.lat]}
            {...(map.regionSourceUrl === undefined ? {} : { regionSourceUrl: map.regionSourceUrl })}
            {...(map.here === null
              ? {}
              : {
                  youLocation: [map.here.lng, map.here.lat] as [number, number],

                  locationStatus: 'granted-in-destination' as const,
                })}
            {...(map.line === null ? {} : { routeCoordinates: map.line })}
          />
        )}
      </View>
      <View style={[styles.back, { top: insets.top + theme.space['8'], left: theme.size.gutter }]}>
        <BackButton onPress={close} testID="sos-map-back" />
      </View>
      <View
        onLayout={(event) => setCardHeight(event.nativeEvent.layout.height)}
        style={[
          styles.card,
          { padding: theme.size.gutter, paddingBottom: insets.bottom + theme.space['16'] },
        ]}
      >
        <Card tone="raised" testID="sos-map-card">
          <Stack gap="12">
            <Text variant="label">
              {upper(t({ id: 'safety.sos.title', message: `${name} needs help` }), locale)}
            </Text>
            <Text variant="title" testID="sos-map-line">
              {line}
            </Text>
            {map.line === null || map.ended ? null : (
              <SecondaryText>
                {t({
                  id: 'safety.map.straight',
                  message: 'The line is straight; your maps app has the walking route.',
                })}
              </SecondaryText>
            )}
            {sender === null || map.ended ? null : (
              <PillButton
                label={t({ id: 'safety.map.directions', message: 'Walking directions' })}
                block
                onPress={() =>
                  void Linking.openURL(
                    walkingDirectionsUrl(
                      sender,
                      Platform.OS === PLATFORM.ios ? PLATFORM.ios : PLATFORM.android,
                    ),
                  )
                }
                testID="sos-map-directions"
              />
            )}
          </Stack>
        </Card>
      </View>
    </Scaffold>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  back: { position: 'absolute' },
  card: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
