/**
 * Lab scenes for the recap page (3m-1) in every state, over the Đà Nẵng fixtures: ready with and
 * without the guide's words, the guide still writing, failed, a late re-run, a traveller who
 * dropped out, a solo trip, a trip with no photos, expenses or kilometres, and offline. The page's
 * model is built from fixture rows by the screen's own builder; every handler is a no-op.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { ReactNode } from 'react';

import { readAward, readRecap, type RecapRow } from '../data/recap-rows';
import { buildSummaryModel, type SummaryInput } from '../summary/summary-model';
import { SummaryView } from '../summary/summary-view';
import { awardRows, CARDS, FORM_ROWS, MAYA, ME, RECEIPT, recapRow, STATS } from './recap-fixtures';

const noop = () => undefined;

function Scene({
  row = recapRow({ cards: CARDS }),
  over = {},
  offline = false,
}: {
  readonly row?: RecapRow | null;
  readonly over?: Partial<SummaryInput>;
  readonly offline?: boolean;
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
  return (
    <SummaryView
      model={model}
      guide="chava"
      guideName="Chà Vá"
      unit="metric"
      offline={offline}
      retrying={false}
      onRetry={noop}
      onShare={noop}
      onWhereNext={noop}
      onGotAway={noop}
    />
  );
}

export const RECAP_SCENES: Readonly<Record<string, () => ReactNode>> = {
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
};

export const RECAP_SCENE_NAMES: readonly string[] = Object.keys(RECAP_SCENES);
