/**
 * Signature strokes fetched for the stamp: a stroke's media key → its signed read URL (the api
 * mints it for whoever can see the stamp) → the stroke JSON, kept in memory for the session since
 * a stroke never changes under its key.
 */
/* eslint-disable lingui/no-unlocalized-strings -- api paths and headers, never copy. */
import { useEffect, useState } from 'react';

import { sessionHeaders } from '@/data/app-session/auth-client';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';

import { decodeStroke, type SignatureStroke } from './stroke';

export type StrokeFetch = (mediaKey: string) => Promise<SignatureStroke | null>;

const strokes = new Map<string, Promise<SignatureStroke | null>>();

async function readUrl(mediaKey: string): Promise<string | null> {
  const response = await fetch(`${resolveApiBaseUrl()}/v1/media/read-urls`, {
    method: 'POST',
    headers: { ...(await sessionHeaders()), 'content-type': 'application/json' },
    body: JSON.stringify({ media_keys: [mediaKey] }),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { urls?: { media_key: string; url: string }[] };
  return body.urls?.find((entry) => entry.media_key === mediaKey)?.url ?? null;
}

export const fetchStroke: StrokeFetch = (mediaKey) => {
  const cached = strokes.get(mediaKey);
  if (cached !== undefined) return cached;
  const loading = readUrl(mediaKey)
    .then(async (url) => {
      if (url === null) return null;
      const response = await fetch(url);
      return response.ok ? decodeStroke(await response.text()) : null;
    })
    .catch(() => null);
  // A failed read may succeed later (signal back): only a stroke is kept.
  void loading.then((stroke) => {
    if (stroke === null) strokes.delete(mediaKey);
  });
  strokes.set(mediaKey, loading);
  return loading;
};

export function useStroke(
  mediaKey: string | null,
  load: StrokeFetch = fetchStroke,
): SignatureStroke | null {
  const [stroke, setStroke] = useState<{ key: string; value: SignatureStroke | null } | null>(null);
  useEffect(() => {
    if (mediaKey === null) return undefined;
    let live = true;
    void load(mediaKey).then((value) => {
      if (live) setStroke({ key: mediaKey, value });
    });
    return () => {
      live = false;
    };
  }, [mediaKey, load]);
  return stroke !== null && stroke.key === mediaKey ? stroke.value : null;
}
