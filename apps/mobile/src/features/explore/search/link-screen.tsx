/**
 * Add from a link (7d-3) as a screen over search: imports the link (or, for a screenshot, picks
 * one and reads it on the phone first), lets the traveller tick, pick and save, and words the tip
 * for the day the places share.
 */
/* eslint-disable lingui/no-unlocalized-strings -- design screen ids and param keys, never copy. */
import { poiCategorySchema } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { toast } from '@/motion/island-toast';
import { hrefFor } from '@/lib/navigation/screen-registry';

import { categoryWord } from './chip-row';
import { useSearchServices, type ImportBody } from './data/search-services';
import { chosenPlaces, sharedBestDay } from './link-import-model';
import { LinkSheet } from './link-sheet';
import { PickOneSheet } from './pick-one-sheet';
import { searchRoutes } from './routes';
import { useLinkActions } from './use-link-actions';
import { useLinkImport } from './use-link-import';
import { useSearchTrip } from './use-search-trip';

export interface LinkScreenProps {
  readonly tripId: string;
  readonly url: string | null;
  /** Opened to add a screenshot: the picker comes up first. */
  readonly screenshot: boolean;
}

function kindWord(category: string): string {
  const parsed = poiCategorySchema.safeParse(category);
  return parsed.success ? categoryWord(parsed.data) : '';
}

export function LinkScreen({ tripId, url, screenshot }: LinkScreenProps) {
  const services = useSearchServices();
  const trip = useSearchTrip(tripId);
  const [body, setBody] = useState<ImportBody | null>(url === null ? null : { url });
  const [picking, setPicking] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const { state, dispatch, retry } = useLinkImport(tripId, body);
  const actions = useLinkActions(tripId, url);

  const addScreenshot = () => {
    setProblem(null);
    void services.readScreenshot().then((read) => {
      if (read.kind === 'text') setBody({ text: read.text, kind: 'screenshot' });
      else if (read.kind === 'cancelled') {
        if (body === null) router.back();
      } else if (read.kind === 'no_text') {
        setProblem(
          t({ id: 'search.link.noText', message: 'I couldn’t read any words in that screenshot.' }),
        );
      } else if (read.kind === 'unavailable') {
        setProblem(
          t({ id: 'search.link.noPicker', message: 'Screenshots can’t be read on this phone.' }),
        );
      }
    });
  };
  useEffect(() => {
    if (screenshot) void Promise.resolve().then(addScreenshot);
    // Once, when opened for a screenshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const places = chosenPlaces(state);
  const bestDay = sharedBestDay(places);
  const day = trip.days.find((entry) => entry.dayNo === bestDay) ?? null;
  const dayLabel = day === null ? null : `${day.weekday ?? ''} ${day.date?.slice(8) ?? ''}`.trim();
  const weekday = day?.weekday ?? '';
  const tip =
    day === null || state.status !== 'done'
      ? problem
      : t({ id: 'search.link.tip', message: `Your ${weekday} works for these.` });
  const pickingMatch = state.matches.find((match) => match.label === picking);

  const saveToIdeas = () => {
    const count = places.length;
    void actions.saveToIdeas(places).then((saved) => {
      if (saved === 0) return;
      const ideas = hrefFor('7f-2', { tripId });
      toast.show({
        id: 'search-link-saved',
        title: t({ id: 'search.link.savedToast', message: `${count} saved to Ideas` }),
        ...(ideas === undefined
          ? {}
          : {
              action: {
                label: t({ id: 'search.link.openIdeas', message: 'Open' }),
                onPress: () => router.push(ideas),
              },
            }),
      });
      router.back();
    });
  };
  const putOnDay = () => {
    if (bestDay === null) return;
    void actions.putOnDay(places, bestDay).then((outcome) => {
      if (outcome.kind === 'unavailable') return;
      const shown = dayLabel ?? '';
      toast.show({
        id: 'search-link-day',
        title:
          outcome.kind === 'applied'
            ? t({ id: 'search.link.addedToast', message: `Added to ${shown}` })
            : t({ id: 'search.link.proposedToast', message: 'Sent to the crew to approve' }),
      });
      router.back();
    });
  };

  return (
    <>
      <LinkSheet
        state={state}
        guide={trip.guide}
        guideName={trip.guideName}
        kindWord={kindWord}
        tip={tip}
        dayLabel={dayLabel === '' ? null : dayLabel}
        chosen={places.length}
        saving={actions.busy}
        onToggle={(label) => dispatch({ type: 'toggle', label })}
        onPick={setPicking}
        onSearch={(label) => router.replace(searchRoutes.search(tripId, { q: label }))}
        onSave={saveToIdeas}
        onPutOnDay={putOnDay}
        onScreenshot={addScreenshot}
        onRetry={retry}
        onClose={() => router.back()}
      />
      {pickingMatch?.kind === 'ambiguous' ? (
        <PickOneSheet
          label={pickingMatch.label}
          candidates={pickingMatch.candidates}
          onPick={(poiId) => {
            dispatch({ type: 'pick', label: pickingMatch.label, poiId });
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      ) : null}
    </>
  );
}
