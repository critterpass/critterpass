/**
 * Add from a link (7d-3) as a screen over search: imports the link (or, for a screenshot, picks
 * one and reads it on the phone first), lets the traveller tick, pick and save, and words the tip
 * for the day the places share. Opened with no link it asks for one to be pasted. Saving and
 * "put them on the day" both end with what happened, by name.
 */
/* eslint-disable lingui/no-unlocalized-strings -- design screen ids and param keys, never copy. */
import { poiCategorySchema } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { usePlaceTilePhotos } from '@/data/media/use-place-tile-photos';
import { toast } from '@/motion/island-toast';
import { hrefFor } from '@/lib/navigation/screen-registry';

import { categoryWord } from './chip-row';
import { useSearchServices, type ImportBody } from './data/search-services';
import { chosenPlaces, sharedBestDay } from './link-import-model';
import { dayEndWords, dayFailedWords, savedEndWords, tipLine } from './link-copy';
import { LinkPaste } from './link-paste';
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
  const sourceUrl = body !== null && 'url' in body ? body.url : url;
  const actions = useLinkActions(tripId, sourceUrl);

  const addScreenshot = () => {
    setProblem(null);
    void services.readScreenshot().then((read) => {
      if (read.kind === 'text') setBody({ text: read.text, kind: 'screenshot' });
      else if (read.kind === 'cancelled') {
        // Opened for a screenshot and none picked: there is nothing here to come back to.
        if (body === null && screenshot) router.back();
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
  const tip = day === null || state.status !== 'done' ? problem : tipLine(weekday);
  const pickingMatch = state.matches.find((match) => match.label === picking);
  const pickPhotos = usePlaceTilePhotos(
    pickingMatch?.kind === 'ambiguous'
      ? pickingMatch.candidates.map((candidate) => candidate.poi_id)
      : [],
  );

  const saveToIdeas = () => {
    void actions.saveToIdeas(places).then((saved) => {
      const words = savedEndWords(saved, places);
      const ideas = hrefFor('7f-2', { tripId });
      toast.show({
        id: 'search-link-saved',
        ...words,
        ...(ideas === undefined || saved.length === 0
          ? {}
          : {
              action: {
                label: t({ id: 'search.link.openIdeas', message: 'Open' }),
                onPress: () => router.push(ideas),
              },
            }),
      });
      if (saved.length > 0) router.back();
    });
  };
  const putOnDay = () => {
    if (bestDay === null) return;
    const shown = dayLabel ?? '';
    void actions.putOnDay(places, bestDay).then((end) => {
      toast.show({
        id: 'search-link-day',
        ...(end.kind === 'failed' ? dayFailedWords(shown) : dayEndWords(end, shown)),
      });
      if (end.kind === 'done') router.back();
    });
  };

  if (body === null) {
    return (
      <LinkPaste
        problem={problem}
        readClipboard={services.readClipboard}
        onAdd={(link) => {
          setProblem(null);
          setBody({ url: link });
        }}
        onScreenshot={addScreenshot}
        onClose={() => router.back()}
      />
    );
  }

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
          photos={pickPhotos}
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
