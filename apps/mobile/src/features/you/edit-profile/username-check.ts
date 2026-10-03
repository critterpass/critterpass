/**
 * The username field's live answer: the rules first (on the phone), then, 300 ms after typing
 * stops, whether the server still has it free. No signal reads as "unknown": SAVE may still try.
 */
/* eslint-disable lingui/no-unlocalized-strings -- a route, never copy. */
import { usernameAvailabilitySchema } from '@cp/domain';
import { useEffect, useState } from 'react';

import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';

import {
  usernameLocalState,
  type ProfileDraft,
  type SavedProfile,
  type UsernameState,
} from './edit-profile-model';

export const USERNAME_DEBOUNCE_MS = 300;
const TIMEOUT_MS = 6000;

export type UsernameLookup = (username: string) => Promise<'available' | 'taken' | 'unknown'>;

export const deviceUsernameLookup: UsernameLookup = async (username) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const { sessionHeaders } = await import('@/data/app-session/auth-client');
    const response = await fetch(
      `${resolveApiBaseUrl()}/v1/me/username-available?u=${encodeURIComponent(username)}`,
      {
        headers: { accept: 'application/json', ...(await sessionHeaders()) },
        signal: controller.signal,
      },
    );
    if (response.status !== 200) return 'unknown';
    const parsed = usernameAvailabilitySchema.safeParse(await response.json());
    if (!parsed.success) return 'unknown';
    return parsed.data.available ? 'available' : 'taken';
  } catch {
    return 'unknown';
  } finally {
    clearTimeout(timer);
  }
};

export function useUsernameState(
  saved: SavedProfile | null,
  draft: ProfileDraft | null,
  lookup: UsernameLookup = deviceUsernameLookup,
  now: () => Date = () => new Date(),
): UsernameState {
  const local =
    saved === null || draft === null
      ? { kind: 'unchanged' as const }
      : usernameLocalState(saved, draft, now());
  const candidate =
    local === null && draft !== null ? draft.username.replace(/^@/, '').trim().toLowerCase() : null;
  const [answer, setAnswer] = useState<{ username: string; state: UsernameState } | null>(null);

  useEffect(() => {
    if (candidate === null) return undefined;
    let live = true;
    const timer = setTimeout(() => {
      void lookup(candidate).then((result) => {
        if (live) setAnswer({ username: candidate, state: { kind: result } });
      });
    }, USERNAME_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [candidate, lookup]);

  if (local !== null) return local;
  return answer !== null && answer.username === candidate ? answer.state : { kind: 'checking' };
}
