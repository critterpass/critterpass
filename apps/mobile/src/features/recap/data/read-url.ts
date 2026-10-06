/**
 * A recap media object's signed read URL (a narration clip, a signature stroke, the memory's
 * photo): the api mints it for whoever may see the object. Null when it cannot be read now.
 */
/* eslint-disable lingui/no-unlocalized-strings -- api paths and headers, never copy. */
import { sessionHeaders } from '@/data/app-session/auth-client';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';

export async function readMediaUrl(mediaKey: string): Promise<string | null> {
  try {
    const response = await fetch(`${resolveApiBaseUrl()}/v1/media/read-urls`, {
      method: 'POST',
      headers: { ...(await sessionHeaders()), 'content-type': 'application/json' },
      body: JSON.stringify({ media_keys: [mediaKey] }),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { urls?: { media_key: string; url: string }[] };
    return body.urls?.find((entry) => entry.media_key === mediaKey)?.url ?? null;
  } catch {
    return null;
  }
}
