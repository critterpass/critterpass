/**
 * Add from a link (7d-3) as a screen over search: imports the link (or, for a screenshot, picks
 * one and reads it on the phone first), lets the traveller tick, pick and save, and words the tip
 * for the day the places share. Opened with no link it asks for one to be pasted. Saving and
 * "put them on the day" both end with what happened, by name.
 */
import { router } from 'expo-router';
import type { ComponentType } from 'react';

import { LinkPaste } from './link-paste';
import { LinkSheet, type LinkSheetProps } from './link-sheet';
import { PickOneSheet } from './pick-one-sheet';
import { searchRoutes } from './routes';
import { kindWord, useLinkScreen } from './use-link-screen';

export interface LinkScreenProps {
  readonly tripId: string;
  readonly url: string | null;
  /** Opened to add a screenshot: the picker comes up first. */
  readonly screenshot: boolean;
  /** How the found places are drawn; the logic is the same in every look. @default the current look */
  readonly Sheet?: ComponentType<LinkSheetProps> | undefined;
}

export function LinkScreen({ tripId, url, screenshot, Sheet = LinkSheet }: LinkScreenProps) {
  const {
    trip,
    body,
    setBody,
    problem,
    setProblem,
    state,
    dispatch,
    retry,
    actions,
    addScreenshot,
    places,
    dayLabel,
    tip,
    setPicking,
    pickingMatch,
    pickPhotos,
    saveToIdeas,
    putOnDay,
    readClipboard,
  } = useLinkScreen({ tripId, url, screenshot });

  if (body === null) {
    return (
      <LinkPaste
        problem={problem}
        readClipboard={readClipboard}
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
      <Sheet
        state={state}
        guide={trip.guide}
        guideName={trip.guideName}
        kindWord={kindWord}
        tip={tip}
        dayLabel={dayLabel}
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
