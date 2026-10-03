/**
 * What the weather suggestion needs beyond the change set (3e-2): the guide's own line for it,
 * written by the replan job on the `weather` disruption and read in the app's language (guide
 * text), and turning it down (`dismiss_weather_suggestion`, queued: the change set is rejected and
 * the item is not suggested again that day).
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and command names, never copy. */
import type { DismissWeatherSuggestionPayload } from '@cp/domain';
import { msg } from '@lingui/core/macro';

import { defineClientCommand } from '@/data/commands/summaries';
import { useGuideText } from '@/lib/i18n/guide-text';
import { useLiveRows } from '@/data/plan/live-rows';

const SUGGESTION_SQL = `SELECT change_set_id, title, summary, i18n FROM disruptions
  WHERE trip_id = ? AND kind = 'weather' AND status = 'open' AND change_set_id IS NOT NULL`;

interface SuggestionRow {
  readonly change_set_id: string;
  readonly title: string;
  readonly summary: string;
  readonly i18n: string | null;
}

export const dismissWeatherSuggestionCommand = defineClientCommand<DismissWeatherSuggestionPayload>(
  {
    name: 'dismiss_weather_suggestion',
    offline: true,
    summarize: () => msg({ id: 'plan.timeline.queued.dismiss', message: 'Not moving it' }),
  },
);

/** The guide's headline for each open weather change set, in the app's language. */
export function useWeatherHeadlines(tripId: string | null): ReadonlyMap<string, string> {
  const words = useGuideText();
  const { rows } = useLiveRows<SuggestionRow>(SUGGESTION_SQL, tripId === null ? null : [tripId], [
    'disruptions',
  ]);
  return new Map(
    rows
      .map((row) => [row.change_set_id, words('disruption', row, 'title') ?? row.title] as const)
      .filter(([, title]) => title !== ''),
  );
}
