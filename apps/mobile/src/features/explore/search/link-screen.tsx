/**
 * Add from a link (7d-3) as a screen over search: imports the link (or, for a screenshot, picks
 * one and reads it on the phone first), lets the traveller tick, pick and save, and words the tip
 * for the day the places share. Opened with no link it asks for one to be pasted. Saving and
 * "put them on the day" both end with what happened, by name.
 */
import { router } from 'expo-router';
import type { ComponentType } from 'react';

import { searchRoutes } from './routes';
import { kindWord, useLinkScreen } from './use-link-screen';
import type { GuideId } from '@/lib/navigation/active-guide';
import type { LinkImportState } from './link-import-model';
import type { ImportCandidate } from '@cp/domain';
import { type PlaceTilePhotos } from '@/data/media/use-place-tile-photos';

export interface LinkScreenProps {
  readonly tripId: string;
  readonly url: string | null;
  /** Opened to add a screenshot: the picker comes up first. */
  readonly screenshot: boolean;
  /** How the found places are drawn; the logic stays here. */
  readonly Sheet: ComponentType<LinkSheetProps>;
  /** The paste page before there is a link. */
  readonly Paste: ComponentType<LinkPasteProps>;
  /** The chooser for a mention that could be several places. */
  readonly PickOne: ComponentType<PickOneSheetProps>;
}

export function LinkScreen({ tripId, url, screenshot, Sheet, Paste, PickOne }: LinkScreenProps) {
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
      <Paste
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
        <PickOne
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

export interface LinkPasteProps {
  /** Why the last try did not work (an unreadable screenshot), or null. */
  readonly problem: string | null;
  /** The clipboard's text where it can be read on a tap (Android); null elsewhere. */
  readonly readClipboard: () => Promise<string | null>;
  readonly onAdd: (url: string) => void;
  readonly onScreenshot: () => void;
  readonly onClose: () => void;
  /** Lab and tests: leave the system paste control out. */
  readonly pasteControl?: boolean;
}

export interface LinkSheetProps {
  readonly state: LinkImportState;
  readonly guide: GuideId;
  readonly guideName: string;
  readonly kindWord: (category: string) => string;
  /** "Your free Sat works for these.", when a shared day fits. */
  readonly tip: string | null;
  /** "Sat 17", when the chosen places share a best day. */
  readonly dayLabel: string | null;
  readonly chosen: number;
  readonly saving: boolean;
  readonly onToggle: (label: string) => void;
  readonly onPick: (label: string) => void;
  readonly onSearch: (label: string) => void;
  readonly onSave: () => void;
  readonly onPutOnDay: () => void;
  readonly onScreenshot: () => void;
  readonly onRetry: () => void;
  readonly onClose: () => void;
}

export interface PickOneSheetProps {
  readonly label: string;
  readonly candidates: readonly ImportCandidate[];
  /** The candidates' photos by POI id, as they arrive. */
  readonly photos?: PlaceTilePhotos | undefined;
  readonly onPick: (poiId: string) => void;
  readonly onClose: () => void;
}
