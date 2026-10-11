/**
 * A link pasted on first launch that was not an invite (a TikTok, a Maps pin): kept on the phone
 * for the first trip, where Home offers to add it to that trip's ideas (2.04). Only the link and
 * where it came from are kept; it never leaves the phone until it is added.
 */
/* eslint-disable lingui/no-unlocalized-strings -- a storage key and wire values, never copy. */
import { createMMKV, useMMKVString } from 'react-native-mmkv';

import type { PasteSource } from './paste-classify';

const storage = createMMKV({ id: 'cp-onboarding' });
const KEY = 'saved_first_trip_link';

export interface SavedLink {
  readonly url: string;
  readonly source: PasteSource | null;
}

function parse(raw: string | undefined): SavedLink | null {
  if (raw === undefined) return null;
  try {
    const value = JSON.parse(raw) as Partial<SavedLink>;
    return typeof value.url === 'string' ? { url: value.url, source: value.source ?? null } : null;
  } catch {
    return null;
  }
}

/** Keeps `text` when it is a web link; anything else is not worth keeping. */
export function saveFirstTripLink(text: string, source: PasteSource | null): SavedLink | null {
  const url = text.trim();
  if (!/^https?:\/\/\S+$/iu.test(url)) return null;
  const saved: SavedLink = { url, source };
  storage.set(KEY, JSON.stringify(saved));
  return saved;
}

export function clearFirstTripLink(): void {
  storage.remove(KEY);
}

/** The kept link, live (null when none). */
export function useSavedFirstTripLink(): SavedLink | null {
  const [raw] = useMMKVString(KEY, storage);
  return parse(raw);
}
