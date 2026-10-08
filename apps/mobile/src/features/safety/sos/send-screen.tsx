/**
 * Sending an SOS (designed in code): an optional preset ("I fell", "I'm lost", "Need a ride") and a
 * few words, SLIDE TO SEND, then five seconds to cancel before anything leaves the phone. It goes
 * through the offline queue (replayed when signal returns, never twice); with no data the phone's
 * own message composer opens prefilled to the crew. More than three in a day asks once more.
 */
import { generateUuidV7, SOS_DAILY_CONFIRM_AFTER, type SosPreset } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCommand } from '@/data/commands/use-command';
import { useSyncPhase } from '@/data/status/use-sync-status';
import { coarsePosition } from '@/lib/location/geocode';
import { PillButton } from '@/ui/buttons/PillButton';
import { SecondaryText } from '@/ui/cards/SecondaryText';
import { ChoiceChip } from '@/ui/chips/ChoiceChip';
import { Icon } from '@/ui/icons/Icon';
import { SlideToConfirm } from '@/ui/inputs/SlideToConfirm';
import { TextField } from '@/ui/inputs/TextField';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { ConfirmSheet } from '@/ui/states/ConfirmSheet';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import { triggerSosCommand } from '../commands';
import { deviceHelpApi } from '../data/help-api';
import { useLiveRows } from '../data/live-rows';
import { useHelpHub } from '../help/use-help-hub';
import { safetyRoutes } from '../routes';
import { PHONES_SQL, PHONES_TABLES, PLATFORM, TODAY_SQL, TODAY_TABLES } from './send-queries';
import { mapsLink, smsUrl } from './sms-fallback';
import { useCountdown } from './use-countdown';

export function SosSendScreen() {
  const { t } = useLingui();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tripId?: string }>();
  const asked = typeof params.tripId === 'string' && params.tripId !== '' ? params.tripId : null;
  const hub = useHelpHub(deviceHelpApi, asked);
  const tripId = hub.tripId;
  const syncPhase = useSyncPhase();
  const trigger = useCommand(triggerSosCommand);
  const [preset, setPreset] = useState<SosPreset | null>(null);
  const [text, setText] = useState('');
  const [confirming, setConfirming] = useState(false);
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const today = Number(
    useLiveRows<{ n: number }>(
      TODAY_SQL,
      hub.uid === null ? null : [hub.uid, midnight.toISOString()],
      TODAY_TABLES,
    ).rows[0]?.n ?? 0,
  );
  const phones = useLiveRows<{ phone_display: string }>(
    PHONES_SQL,
    tripId === null || hub.uid === null ? null : [tripId, hub.uid],
    PHONES_TABLES,
  ).rows.map((row) => row.phone_display);

  async function send() {
    if (tripId === null) return;
    const sosId = generateUuidV7();
    const at = hub.position ?? (await coarsePosition());
    const words = text.trim();
    await trigger.send({
      trip_id: tripId,
      sos_id: sosId,
      ...(preset === null ? {} : { preset }),
      ...(words === '' ? {} : { text: words.slice(0, 280) }),
      ...(at === null
        ? {}
        : { fix: { lat: at.lat, lng: at.lng, acc: 100, at: new Date().toISOString() } }),
      ...(hub.model.placeLabel === null ? {} : { place_label: hub.model.placeLabel.slice(0, 120) }),
    });
    if (syncPhase === 'offline' && phones.length > 0) {
      const link = mapsLink(at);
      const body =
        link === null
          ? t({ id: 'safety.sms.body', message: 'SOS: I need help. Please call me.' })
          : t({ id: 'safety.sms.bodyWhere', message: `SOS: I need help. I'm here: ${link}` });
      void Linking.openURL(
        smsUrl(
          { numbers: phones, body },
          Platform.OS === PLATFORM.ios ? PLATFORM.ios : PLATFORM.android,
        ),
      );
    }
    router.replace(safetyRoutes.sos(sosId, true));
  }

  const countdown = useCountdown(() => void send());
  const presets: readonly { id: SosPreset; label: string }[] = [
    { id: 'fell', label: t({ id: 'safety.preset.fell', message: 'I fell' }) },
    { id: 'lost', label: t({ id: 'safety.preset.lost', message: "I'm lost" }) },
    // eslint-disable-next-line lingui/no-unlocalized-strings -- a preset id, never copy.
    { id: 'need_ride', label: t({ id: 'safety.preset.ride', message: 'Need a ride' }) },
  ];
  const general = hub.model.general.number;
  const left = countdown.left;
  return (
    <Scaffold variant="dark" testID="sos-send-screen">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: theme.size.gutter,
          paddingBottom: insets.bottom + theme.space['32'],
          gap: theme.space['20'],
        }}
      >
        <BackEyebrow label={t({ id: 'safety.back.help', message: 'Help' })} />
        <Text variant="h1" accessibilityRole="header">
          {t({ id: 'safety.send.title', message: 'SOS to your crew' })}
        </Text>
        <SecondaryText>
          {t({
            id: 'safety.send.line',
            message: `Every crewmate gets an alert that comes through Do Not Disturb, with where you are. CritterPass tells your crew; for emergencies call ${general}.`,
          })}
        </SecondaryText>
        <Row gap="8" wrap>
          {presets.map((p) => (
            <ChoiceChip
              key={p.id}
              label={p.label}
              selected={preset === p.id}
              onPress={() => setPreset(preset === p.id ? null : p.id)}
              testID={`sos-preset-${p.id}`}
            />
          ))}
        </Row>
        <TextField
          label={t({ id: 'safety.send.words', message: 'A few words (optional)' })}
          value={text}
          onChangeText={setText}
          maxLength={280}
          maxLines={3}
          testID="sos-text"
        />
        {left === null ? (
          <SlideToConfirm
            label={t({ id: 'safety.send.slide', message: 'Slide to send SOS' })}
            actionLabel={t({ id: 'safety.send.action', message: 'Send SOS' })}
            disabled={tripId === null || trigger.pending}
            knob={
              <View testID="sos-knob" style={styles.knob}>
                <Icon name="bell" size={28} color={theme.color.ink['950']} decorative />
              </View>
            }
            onConfirm={() =>
              today >= SOS_DAILY_CONFIRM_AFTER ? setConfirming(true) : countdown.start()
            }
            testID="sos-slide"
          />
        ) : (
          <Stack gap="12" testID="sos-countdown">
            <Text variant="h2" accessibilityLiveRegion="assertive">
              {t({ id: 'safety.send.countdown', message: `Sending in ${left}…` })}
            </Text>
            <PillButton
              label={t({ id: 'safety.send.cancel', message: 'Cancel' })}
              variant="secondary"
              block
              onPress={countdown.cancel}
              testID="sos-cancel"
            />
          </Stack>
        )}
      </ScrollView>
      {confirming ? (
        <ConfirmSheet
          title={t({ id: 'safety.send.againTitle', message: 'Send another SOS today?' })}
          consequences={[
            t({
              id: 'safety.send.againLine',
              message: 'Your whole crew gets another alert through Do Not Disturb.',
            }),
          ]}
          confirmLabel={t({ id: 'safety.send.action', message: 'Send SOS' })}
          mode="button"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            countdown.start();
          }}
          testID="sos-again-confirm"
        />
      ) : null}
    </Scaffold>
  );
}

const styles = StyleSheet.create({
  knob: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
