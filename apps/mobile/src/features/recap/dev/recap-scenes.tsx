/**
 * Lab scenes for the recap page (3m-1) in every state, over the Đà Nẵng fixtures: ready with and
 * without the guide's words, the guide still writing, failed, a late re-run, a traveller who
 * dropped out, a solo trip, a trip with no photos, expenses or kilometres, and offline. The page's
 * model is built from fixture rows by the screen's own builder; SHARE RECAP opens the real sheet and
 * draws the real share card, with a link that lives in the scene only (sharing one makes "Stop
 * sharing" appear, stopping takes it away); every other handler is a no-op. The year-later memory's scenes (3m-10) follow.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { useState, type ReactNode } from 'react';

import { readAward, readRecap, type RecapRow } from '../data/recap-rows';
import { buildSummaryModel, type SummaryInput } from '../summary/summary-model';
import { RecapShare } from '../summary/share-choice-sheet';
import { SummaryView } from '../summary/summary-view';
import { MEMORY_SCENES } from './memory-scenes';
import { STORY_SCENES } from './story-scenes';
import { awardRows, CARDS, FORM_ROWS, MAYA, ME, RECEIPT, recapRow, STATS } from './recap-fixtures';

const noop = () => undefined;

function Scene({
  row = recapRow({ cards: CARDS }),
  over = {},
  offline = false,
  share = false,
}: {
  readonly row?: RecapRow | null;
  readonly over?: Partial<SummaryInput>;
  readonly offline?: boolean;
  /** Opens on the share sheet. */
  readonly share?: boolean;
}) {
  const model = buildSummaryModel({
    loaded: true,
    viewerId: ME,
    viewerIn: true,
    trip: {
      startDate: '2026-10-02',
      endDate: '2026-10-04',
      solo: false,
      crewName: 'The Đà Nẵng Four',
      place: 'Đà Nẵng',
    },
    recap: row === null ? null : readRecap(row),
    awards: awardRows(ME).flatMap((award) => readAward(award) ?? []),
    names: new Map([[MAYA, 'Maya']]),
    forms: FORM_ROWS,
    gotAwayName: 'Chà Vá',
    ...over,
  });
  const [sharing, setSharing] = useState(share);
  const [links, setLinks] = useState(0);
  return (
    <>
      <SummaryView
        model={model}
        guide="chava"
        guideName="Chà Vá"
        unit="metric"
        offline={offline}
        retrying={false}
        onRetry={noop}
        onShare={() => setSharing(true)}
        onWhereNext={noop}
        onBack={noop}
        onGotAway={noop}
        onWatch={noop}
        onRate={noop}
      />
      {sharing ? (
        <RecapShare
          model={model}
          guide="chava"
          unit="metric"
          link={{
            stoppable: links,
            busy: false,
            share: () => Promise.resolve(setLinks(1)),
            stop: () => Promise.resolve(setLinks(0)),
          }}
          onClose={() => setSharing(false)}
        />
      ) : null}
    </>
  );
}

export const RECAP_SCENES: Readonly<Record<string, () => ReactNode>> = {
  ...STORY_SCENES,
  '3m-1-recap': () => <Scene />,
  '3m-1-no-copy': () => <Scene row={recapRow()} />,
  '3m-1-writing': () => <Scene row={null} />,
  '3m-1-failed': () => <Scene row={recapRow({ status: 'failed' })} />,
  '3m-1-late-expenses': () => (
    <Scene
      row={recapRow({
        cards: CARDS,
        version: 2,
        changed_sections: '["receipt"]',
        receipt: { ...RECEIPT, outstanding_minor: 4_200, settled: false, settled_on: null },
      })}
    />
  ),
  '3m-1-dropout': () => <Scene over={{ viewerIn: false }} />,
  '3m-1-solo': () => (
    <Scene
      row={recapRow({ cards: CARDS, stats: { ...STATS, travellers: 1 } })}
      over={{
        trip: {
          startDate: '2026-10-02',
          endDate: '2026-10-04',
          solo: true,
          crewName: null,
          place: 'Đà Nẵng',
        },
        awards: awardRows(ME)
          .filter((award) => award.user_id === ME)
          .flatMap((award) => readAward(award) ?? []),
      }}
    />
  ),
  '3m-1-partial': () => (
    <Scene
      row={recapRow({
        stats: { ...STATS, distance_m: 0, photos: null, superlatives: [] },
        receipt: { ...RECEIPT, expenses: 0, meals: 0 },
        got_away: null,
      })}
    />
  ),
  '3m-1-offline': () => <Scene offline />,
  'recap-share-sheet': () => <Scene share />,
  ...MEMORY_SCENES,
};

export const RECAP_SCENE_NAMES: readonly string[] = Object.keys(RECAP_SCENES);
