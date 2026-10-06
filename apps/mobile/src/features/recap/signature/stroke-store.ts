/**
 * Signature strokes fetched for the stamp: a stroke's media key → its signed read URL (the api
 * mints it for whoever can see the stamp) → the stroke JSON, kept in memory for the session since
 * a stroke never changes under its key.
 */
import { useEffect, useState } from 'react';

import { readMediaUrl } from '../data/read-url';
import { decodeStroke, type SignatureStroke } from './stroke';

export type StrokeFetch = (mediaKey: string) => Promise<SignatureStroke | null>;

const strokes = new Map<string, Promise<SignatureStroke | null>>();

export const fetchStroke: StrokeFetch = (mediaKey) => {
  const cached = strokes.get(mediaKey);
  if (cached !== undefined) return cached;
  const loading = readMediaUrl(mediaKey)
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
