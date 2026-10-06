/**
 * The voice consent (`consents.purpose = ai_voice`): asked once, before the guide first listens.
 * On Android, and for languages the phone cannot write down itself, what is said goes to a speech
 * service, and spoken replies come from a voice service. Nothing listens until the answer is yes;
 * the decision is the person's synced consent row, written by `set_consent`. The server checks the
 * same consent on everything voice sends it and answers `CONSENT_REQUIRED` when none stands there
 * (this phone's yes has not arrived, or the consent was withdrawn elsewhere): the question is then
 * asked again rather than voice failing. So that someone who has just said yes is never asked
 * twice, voice waits for the server to take that yes before it sends anything (offline, it says
 * it needs a connection), and a refusal arriving right after is tried once more first.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire values, never copy. */
import { VOICE_CONSENT_COPY_VERSION } from '@cp/domain';
import { msg } from '@lingui/core/macro';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { defineClientCommand } from '@/data/commands/summaries';
import { useCommand } from '@/data/commands/use-command';
import { useSyncStatus } from '@/data/status/use-sync-status';

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

/** A yes the server took this recently may not be visible to the next request yet. */
export const GRANT_SETTLE_MS = 15_000;
const RETRY_AFTER_MS = 1_000;

export interface VoiceConsentGuard {
  /** The server refused for want of the consent: the question is asked again. */
  readonly askAgain: () => void;
  /** This phone's yes reached the server within {@link GRANT_SETTLE_MS}. */
  readonly grantedJustNow: () => boolean;
}

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs a voice request. A consent refusal right after this phone's yes is the yes still landing:
 * the request is tried once more. Any other consent refusal asks the question again and rejects.
 */
export async function withVoiceConsent<T>(
  run: () => Promise<T>,
  guard: VoiceConsentGuard,
  wait: (ms: number) => Promise<void> = pause,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!isVoiceConsentRequired(error)) throw error;
    if (!guard.grantedJustNow()) {
      guard.askAgain();
      throw error;
    }
  }
  await wait(RETRY_AFTER_MS);
  try {
    return await run();
  } catch (error) {
    if (isVoiceConsentRequired(error)) guard.askAgain();
    throw error;
  }
}

/**
 * `sending`: the person said yes and the server has not taken it yet. `needs_connection`: the
 * same, with no network to send it over. Voice opens on `granted` only.
 */
export type VoiceConsentStatus = 'loading' | 'needed' | 'sending' | 'needs_connection' | 'granted';

export interface VoiceConsent extends VoiceConsentGuard {
  readonly status: VoiceConsentStatus;
  /** Records the yes; voice opens once the server has it (it waits in the queue offline). */
  readonly agree: () => void;
}

interface GrantRow {
  readonly status: string | null;
  readonly rejected: number;
}

/** This phone's queued yes: gone or `done` once the server took it, `rejected` if it refused. */
const GRANT_SQL = `SELECT (SELECT status FROM commands WHERE id = ?) AS status,
  EXISTS (SELECT 1 FROM rejected_commands WHERE id = ?) AS rejected`;

export function useVoiceConsent(now: () => number = Date.now): VoiceConsent {
  const rows = useLiveQuery<VoiceConsentRow>(VOICE_CONSENT_SQL, [], ['consents']);
  const { send } = useCommand(setVoiceConsentCommand);
  const offline = useSyncStatus().phase === 'offline';
  /** The yes said on this screen: its queued command, once it has one. */
  const [grant, setGrant] = useState<{ readonly opId: string | null } | null>(null);
  const [refused, setRefused] = useState(false);
  const grantRows = useLiveQuery<GrantRow>(
    grant?.opId == null ? null : GRANT_SQL,
    [grant?.opId ?? '', grant?.opId ?? ''],
    ['commands', 'rejected_commands'],
  );
  const sent = grantRows?.[0];
  const rejected = sent !== undefined && sent.rejected === 1;
  const taken = sent !== undefined && !rejected && (sent.status === null || sent.status === 'done');
  const takenAt = useRef<number | null>(null);
  useEffect(() => {
    if (taken && takenAt.current === null) takenAt.current = now();
    if (!taken) takenAt.current = null;
  }, [taken, now]);

  const askAgain = useCallback(() => {
    setGrant(null);
    setRefused(true);
  }, []);
  const agree = useCallback(() => {
    setRefused(false);
    setGrant({ opId: null });
    void send({ purpose: 'ai_voice', granted: true, copy_version: VOICE_CONSENT_COPY_VERSION })
      .then((result) => setGrant((current) => (current === null ? null : { opId: result.opId })))
      .catch(() => setGrant(null));
  }, [send]);
  const grantedJustNow = useCallback(
    () => takenAt.current !== null && now() - takenAt.current < GRANT_SETTLE_MS,
    [now],
  );

  let status: VoiceConsentStatus;
  if (refused || (grant !== null && rejected)) status = 'needed';
  else if (grant !== null) status = taken ? 'granted' : offline ? 'needs_connection' : 'sending';
  else if (rows === null) status = 'loading';
  else status = voiceConsentGranted(rows) ? 'granted' : 'needed';
  return useMemo(
    () => ({ status, agree, askAgain, grantedJustNow }),
    [status, agree, askAgain, grantedJustNow],
  );
}
