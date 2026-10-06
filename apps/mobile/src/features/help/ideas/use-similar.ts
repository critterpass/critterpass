/**
 * The ideas a suggestion sounds like, asked of the api 300 ms after typing stops; a title too
 * short to match, or no connection, answers none.
 */
import { useEffect, useState } from 'react';

import { findSimilarOnline, type FindSimilar, type SimilarIdea } from './ideas-api';

export const SIMILAR_DEBOUNCE_MS = 300;
const MIN_CHARS = 3;
const NONE: readonly SimilarIdea[] = [];

export function useSimilarIdeas(
  text: string,
  locale: string,
  find: FindSimilar = findSimilarOnline,
): readonly SimilarIdea[] {
  const [found, setFound] = useState<{ text: string; ideas: readonly SimilarIdea[] } | null>(null);
  const trimmed = text.trim();
  useEffect(() => {
    if (trimmed.length < MIN_CHARS) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void find({ text: trimmed, locale }, controller.signal).then(
        (ideas) => {
          if (!controller.signal.aborted) setFound({ text: trimmed, ideas });
        },
        () => undefined,
      );
    }, SIMILAR_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, locale, find]);
  if (trimmed.length < MIN_CHARS) return NONE;
  // The last answer stays up while the next is asked, so the card does not flicker per key.
  return found?.ideas ?? NONE;
}
