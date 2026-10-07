/**
 * Where a phrase card's "Practise saying it" goes: phrase practice in the phrase's language,
 * starting on that phrase. Offered where the guide's own "Practise phrases" action is (the same
 * switch), and only on a card that asks for it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and a screen registry key, never copy. */
import type { Href } from 'expo-router';

import { useScreenHref } from '@/lib/navigation/screen-registry';

import { useLiveQuery } from '../chat/data/live-rows';

/** The trip the practice counts for (its quests); null or absent outside a trip. */
export interface PractiseFrom {
  readonly tripId?: string | null;
}

const FLAG_SQL =
  "SELECT value FROM client_config WHERE key = 'guide.quick_actions.practise_phrases'";
const FLAG_TABLES = ['client_config'] as const;
const NO_PARAMS: readonly unknown[] = [];

export function usePractiseHref(
  from: PractiseFrom | undefined,
  lang: string,
  phrase: string,
): Href | undefined {
  const flag = useLiveQuery<{ value: string | null }>(
    from === undefined ? null : FLAG_SQL,
    NO_PARAMS,
    FLAG_TABLES,
  );
  const href = useScreenHref('guide-practice', {
    lang,
    text: phrase,
    ...(typeof from?.tripId === 'string' ? { tripId: from.tripId } : {}),
  });
  const on = (flag ?? []).some((row) => row.value === 'true' || row.value === '1');
  return from !== undefined && on ? href : undefined;
}
