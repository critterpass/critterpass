/**
 * The guide's invite lines from the api (docs/api-contracts.md §5.3): tag suggestions for the
 * invite composer and the welcome line on the crew manifest. The api answers its own template when
 * the model is off; these answer null when the api cannot be reached in time (offline, slow or an
 * error), and the screens keep their scripted words.
 */
/* eslint-disable lingui/no-unlocalized-strings -- paths and header values, never copy. */
import {
  crewWelcomeResponseSchema,
  inviteTagsResponseSchema,
  type CrewWelcomeResponse,
  type InviteTagsRequest,
  type InviteTagsResponse,
} from '@cp/domain';

import { sessionHeaders } from '@/data/app-session/device-session';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';

const TIMEOUT_MS = 6000;

interface WireSchema<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

async function postLine<T>(path: string, body: unknown, schema: WireSchema<T>): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${resolveApiBaseUrl()}${path}`, {
      method: 'POST',
      headers: { ...(await sessionHeaders()), 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const parsed = schema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function fetchInviteTags(request: InviteTagsRequest): Promise<InviteTagsResponse | null> {
  return postLine('/v1/invites/tags', request, inviteTagsResponseSchema);
}

export function fetchCrewWelcome(
  crewId: string,
  tripId: string | null,
): Promise<CrewWelcomeResponse | null> {
  return postLine(
    `/v1/crews/${encodeURIComponent(crewId)}/welcome`,
    tripId === null ? {} : { trip_id: tripId },
    crewWelcomeResponseSchema,
  );
}
