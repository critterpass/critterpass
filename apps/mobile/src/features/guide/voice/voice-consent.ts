/**
 * The voice consent (`consents.purpose = ai_voice`): asked once, before the guide first listens.
 * On Android, and for languages the phone cannot write down itself, what is said goes to a speech
 * service, and spoken replies come from a voice service. Nothing listens until the answer is yes;
 * the decision is the person's synced consent row, written by `set_consent`. The server checks the
 * same consent on everything voice sends it and answers `CONSENT_REQUIRED` when none stands there
 * (this phone's yes has not arrived, or the consent was withdrawn elsewhere): the question is then
 * asked again rather than voice failing.
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

/** A refusal from the api, carrying its wire error code (`{error: {code}}`) when it has one. */
export async function refusalOf(response: Response, what: string): Promise<Error> {
  const body = (await response.json().catch(() => null)) as {
    error?: { code?: unknown };
  } | null;
  const code = typeof body?.error?.code === 'string' ? body.error.code : null;
  return Object.assign(new Error(`${what} answered ${response.status}`), { code });
}

/** The server holds no standing voice consent for this person. */
export function isVoiceConsentRequired(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'CONSENT_REQUIRED';
}

/** Runs a voice request; a consent refusal is reported to `onRequired` and still rejects. */
export async function withVoiceConsent<T>(
  run: () => Promise<T>,
  onRequired: () => void,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isVoiceConsentRequired(error)) onRequired();
    throw error;
  }
}

export type VoiceConsentStatus = 'loading' | 'needed' | 'granted';

export interface VoiceConsent {
  readonly status: VoiceConsentStatus;
  /** Records the yes; voice opens at once, the row follows (queued when offline). */
  readonly agree: () => void;
  /** The server refused for want of the consent: the question is asked again. */
  readonly askAgain: () => void;
}

export function useVoiceConsent(): VoiceConsent {
  const rows = useLiveQuery<VoiceConsentRow>(VOICE_CONSENT_SQL, [], ['consents']);
  const { send } = useCommand(setVoiceConsentCommand);
  const [agreed, setAgreed] = useState(false);
  const [refused, setRefused] = useState(false);
  const askAgain = useCallback(() => {
    setAgreed(false);
    setRefused(true);
  }, []);
  const agree = useCallback(() => {
    setRefused(false);
    setAgreed(true);
    void send({
      purpose: 'ai_voice',
      granted: true,
      copy_version: VOICE_CONSENT_COPY_VERSION,
    }).catch(() => setAgreed(false));
  }, [send]);
  const status: VoiceConsentStatus = refused
    ? 'needed'
    : agreed || (rows !== null && voiceConsentGranted(rows))
      ? 'granted'
      : rows === null
        ? 'loading'
        : 'needed';
  return { status, agree, askAgain };
}
