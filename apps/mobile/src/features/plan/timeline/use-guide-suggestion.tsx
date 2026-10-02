/**
 * The guide's weather suggestion on a day (3e-2): the ghost from the open weather change set and
 * the banner line under the timeline ("Rain till 15:00. Move Ridge walk?"). Accepting glides the
 * item into the ghost's place (560 ms), fades the ghost, says so, and 1.3 s later opens the change
 * review (3e-3) on that change set, where it is sent or applied; nothing changes the plan here.
 * The banner speaks the guide's own line when the replan wrote one (in the app's language), and
 * NOT NOW turns the suggestion down. A suggestion made on an older plan version is not shown.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { impact } from '@/motion/feedback';
import { toast } from '@/motion/island-toast';
import { useLocale } from '@/lib/i18n/use-locale';

import { clock } from '../day/format';
import type { DayItem } from '../day/plan-model';
import type { ChangesetRow } from '../day/queries';
import { reviewRoute } from '../day/routes';
import { ghostFor } from './ghost';
import { GHOST_ACCEPT } from './guide-ghost';
import { GuideBanner } from './guide-banner';
import type { TimelineGhost } from './timeline-editor';
import type { RainForecast } from './weather';
import { dismissWeatherSuggestionCommand, useWeatherHeadlines } from './weather-suggestion-data';

export function useGuideSuggestion({
  tripId,
  changesets,
  items,
  date,
  rain,
  guide,
  currentVersionId = null,
}: {
  readonly tripId: string;
  readonly currentVersionId?: string | null;
  readonly changesets: readonly ChangesetRow[];
  readonly items: readonly DayItem[];
  readonly date: string | null;
  readonly rain: RainForecast;
  readonly guide: { readonly kind: string; readonly name: string };
}): { readonly ghost: TimelineGhost | null; readonly banner: ReactNode } {
  const { t } = useLingui();
  const locale = useLocale();
  const [accepted, setAccepted] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const headlines = useWeatherHeadlines(tripId === '' ? null : tripId);
  const dismiss = useCommand(dismissWeatherSuggestionCommand);
  const suggestion =
    date === null ? null : ghostFor(changesets, items, date, { currentVersionId, dismissed });

  useEffect(() => {
    if (accepted === null) return undefined;
    const timer = setTimeout(
      () => router.push(reviewRoute(tripId, accepted)),
      GHOST_ACCEPT.reviewAfterMs,
    );
    return () => clearTimeout(timer);
  }, [accepted, tripId]);

  if (suggestion === null) return { ghost: null, banner: null };
  const isAccepted = accepted === suggestion.changesetId;
  const accept = () => {
    if (isAccepted) return;
    impact('success');
    setAccepted(suggestion.changesetId);
    toast.show({
      id: 'plan-ghost-accepted',
      title: t({
        id: 'plan.timeline.acceptedToast',
        message: `${suggestion.item.title} to ${clock(locale, suggestion.start)}`,
      }),
      subtitle: t({
        id: 'plan.timeline.acceptedLine',
        message: 'Check it over, then send it to the crew.',
      }),
    });
  };
  const decline = () => {
    setDismissed((was) => new Set([...was, suggestion.changesetId]));
    void dismiss.send({ changeset_id: suggestion.changesetId });
  };
  const line =
    headlines.get(suggestion.changesetId) ??
    (rain.kind === 'rain'
      ? t({
          id: 'plan.timeline.bannerRain',
          message: `Rain till ${clock(locale, rain.end)}. Move ${suggestion.item.title}?`,
        })
      : t({ id: 'plan.timeline.bannerMove', message: `Move ${suggestion.item.title}?` }));
  return {
    ghost: {
      itemId: suggestion.item.stableId,
      start: suggestion.start,
      end: suggestion.end,
      detail: `${clock(locale, suggestion.start)} · ${suggestion.reason}`,
      accepted: isAccepted,
      onAccept: accept,
    },
    banner: isAccepted ? null : (
      <GuideBanner guide={guide} line={line} onAccept={accept} onDismiss={decline} />
    ),
  };
}
