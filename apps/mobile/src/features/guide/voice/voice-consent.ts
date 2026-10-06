/**
 * The voice consent (`consents.purpose = ai_voice`): asked once, before the guide first listens.
 * On Android, and for languages the phone cannot write down itself, what is said goes to a speech
 * service, and spoken replies come from a voice service. Nothing listens until the answer is yes;
 * the decision is the person's synced consent row, written by `set_consent`.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire values, never copy. */
import { VOICE_CONSENT_COPY_VERSION } from '@cp/domain';
import { msg } from '@lingui/core/macro';
import { useCallback, useState } from 'react';

import { defineClientCommand } from '@/data/commands/summaries';
import { useCommand } from '@/data/commands/use-command';

import { useLiveQuery } from '../chat/data/live-rows';

export interface VoiceConsentRow {
  readonly granted_at: string | null;
  readonly revoked_at: string | null;
}

export const VOICE_CONSENT_SQL =
  "SELECT granted_at, revoked_at FROM consents WHERE purpose = 'ai_voice'";

/** Standing consent: granted and not withdrawn since. */
export function voiceConsentGranted(rows: readonly VoiceConsentRow[]): boolean {
  return rows.some((row) => row.granted_at !== null && row.revoked_at === null);
}

export const setVoiceConsentCommand = defineClientCommand<{
  readonly purpose: 'ai_voice';
  readonly granted: boolean;
  readonly copy_version: string;
}>({
  name: 'set_consent',
  offline: true,
  summarize: () => msg({ id: 'guide.voice.queuedConsent', message: 'Turning on voice' }),
});

export type VoiceConsentStatus = 'loading' | 'needed' | 'granted';

export interface VoiceConsent {
  readonly status: VoiceConsentStatus;
  /** Records the yes; voice opens at once, the row follows (queued when offline). */
  readonly agree: () => void;
}

export function useVoiceConsent(): VoiceConsent {
  const rows = useLiveQuery<VoiceConsentRow>(VOICE_CONSENT_SQL, [], ['consents']);
  const { send } = useCommand(setVoiceConsentCommand);
  const [agreed, setAgreed] = useState(false);
  const agree = useCallback(() => {
    setAgreed(true);
    void send({
      purpose: 'ai_voice',
      granted: true,
      copy_version: VOICE_CONSENT_COPY_VERSION,
    }).catch(() => setAgreed(false));
  }, [send]);
  const status: VoiceConsentStatus =
    agreed || (rows !== null && voiceConsentGranted(rows))
      ? 'granted'
      : rows === null
        ? 'loading'
        : 'needed';
  return { status, agree };
}
