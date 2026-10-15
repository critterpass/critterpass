/**
 * Sending an SOS, shared by both looks: the trip, an optional preset and a few words, then a
 * five-second countdown before the command goes through the offline queue (replayed when signal
 * returns, never twice). With no data the phone's own message composer opens prefilled to the
 * crew. More than three in a day asks once more first.
 */
import { generateUuidV7, SOS_DAILY_CONFIRM_AFTER, type SosPreset } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { useSyncPhase } from '@/data/status/use-sync-status';
import { coarsePosition } from '@/lib/location/geocode';

import { triggerSosCommand } from '../commands';
import { deviceHelpApi } from '../data/help-api';
import { useLiveRows } from '../data/live-rows';
import { useHelpHub } from '../help/use-help-hub';
import { safetyRoutes } from '../routes';
import { PHONES_SQL, PHONES_TABLES, PLATFORM, TODAY_SQL, TODAY_TABLES } from './send-queries';
import { mapsLink, smsUrl } from './sms-fallback';
import { useCountdown } from './use-countdown';
import { useSendOnce } from './use-send-once';

export interface SosSendState {
  readonly tripId: string | null;
  /** The local general emergency number. */
  readonly general: string;
  readonly presets: readonly { readonly id: SosPreset; readonly label: string }[];
  readonly preset: SosPreset | null;
  readonly togglePreset: (id: SosPreset) => void;
  readonly text: string;
  readonly setText: (text: string) => void;
  readonly sending: boolean;
  readonly failed: boolean;
  /** Seconds left before it goes, or null when no countdown runs. */
  readonly left: number | null;
  /** The slide or hold finished: starts the countdown, or asks first past the daily limit. */
  readonly confirm: () => void;
  readonly cancelCountdown: () => void;
  /** Past the daily limit: another SOS today asks once more before the countdown. */
  readonly needsAgain: boolean;
  /** Starts the countdown without asking (the caller asked already). */
  readonly startCountdown: () => void;
  /** The "send another today?" question is showing. */
  readonly confirming: boolean;
  readonly answerAgain: (send: boolean) => void;
}

export function useSosSend(): SosSendState {
  const { t } = useLingui();
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

  async function send(): Promise<boolean> {
    if (tripId === null) return false;
    const sosId = generateUuidV7();
    const at = hub.position ?? (await coarsePosition());
    const words = text.trim();
    const result = await trigger.send({
      trip_id: tripId,
      sos_id: sosId,
      ...(preset === null ? {} : { preset }),
      ...(words === '' ? {} : { text: words.slice(0, 280) }),
      ...(at === null
        ? {}
        : { fix: { lat: at.lat, lng: at.lng, acc: 100, at: new Date().toISOString() } }),
      ...(hub.model.placeLabel === null ? {} : { place_label: hub.model.placeLabel.slice(0, 120) }),
    });
    if (result.kind === 'rejected' || result.kind === 'unavailable') return false;
    if (syncPhase === 'offline' && phones.length > 0) {
      const link = mapsLink(at);
      const body =
        link === null
          ? t({ id: 'safety.sms.body', message: 'SOS: I need help. Please call me.' })
          : t({ id: 'safety.sms.bodyWhere', message: `SOS: I need help. I’m here: ${link}` });
      void Linking.openURL(
        smsUrl(
          { numbers: phones, body },
          Platform.OS === PLATFORM.ios ? PLATFORM.ios : PLATFORM.android,
        ),
      );
    }
    router.replace(safetyRoutes.sos(sosId, true));
    return true;
  }

  const once = useSendOnce(send);
  const countdown = useCountdown(once.fire);
  const presets: readonly { id: SosPreset; label: string }[] = [
    { id: 'fell', label: t({ id: 'safety.preset.fell', message: 'I fell' }) },
    { id: 'lost', label: t({ id: 'safety.preset.lost', message: 'I’m lost' }) },
    // eslint-disable-next-line lingui/no-unlocalized-strings -- a preset id, never copy.
    { id: 'need_ride', label: t({ id: 'safety.preset.ride', message: 'Need a ride' }) },
  ];
  return {
    tripId,
    general: hub.model.general.number,
    presets,
    preset,
    togglePreset: (id) => setPreset(preset === id ? null : id),
    text,
    setText,
    sending: once.sending,
    failed: once.failed,
    left: countdown.left,
    confirm: () => (today >= SOS_DAILY_CONFIRM_AFTER ? setConfirming(true) : countdown.start()),
    cancelCountdown: countdown.cancel,
    needsAgain: today >= SOS_DAILY_CONFIRM_AFTER,
    startCountdown: countdown.start,
    confirming,
    answerAgain: (go) => {
      setConfirming(false);
      if (go) countdown.start();
    },
  };
}
