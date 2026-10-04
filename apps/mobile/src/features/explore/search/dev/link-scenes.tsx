/**
 * Lab scenes for add from a link (7d-3) over the @balibites fixture: the places found (two sure,
 * one to pick, ticks toggle), still reading, the pick-one chooser, and a link that can't be read.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { ImportCandidate, ImportEvent } from '@cp/domain';
import { useReducer, useState, type ReactNode } from 'react';

import { categoryWord } from '../chip-row';
import {
  LINK_IMPORT_START,
  linkImportReducer,
  chosenPlaces,
  type LinkImportState,
} from '../link-import-model';
import { tipLine } from '../link-copy';
import { LinkSheet } from '../link-sheet';
import { PickOneSheet } from '../pick-one-sheet';
import { SearchView } from '../search-view';
import { header } from './search-fixtures';

const candidate = (
  n: number,
  name: string,
  meta: string,
  dayNo: number | null,
): ImportCandidate => ({
  poi_id: `0199a3f0-0000-7000-8000-0000000001${String(10 + n)}`,
  name,
  category: 'nature',
  meta,
  fit_best: dayNo === null ? null : { day_no: dayNo, grade: 'good' },
});

const SWINGS = [
  candidate(3, 'Aloha Swing', 'Tegallalang', 6),
  candidate(4, 'Bali Swing', 'Bongkasa', 6),
  candidate(5, 'Zen Swing', 'Tegallalang', null),
];

const EVENTS: readonly ImportEvent[] = [
  {
    event: 'source',
    data: {
      platform: 'tiktok',
      read: 'post_text',
      title: '3 waterfalls nobody tells you about',
      author: '@balibites',
      thumb_url: null,
    },
  },
  {
    event: 'match',
    data: { label: 'Tukad Cepung', ...candidate(1, 'Tukad Cepung', 'Bangli · 50 min', 6) },
  },
  {
    event: 'match',
    data: { label: 'Tibumana', ...candidate(2, 'Tibumana', 'Bangli · 25 min', 6) },
  },
  { event: 'ambiguous', data: { label: 'the swing with the view', candidates: SWINGS } },
  { event: 'done', data: { matched: 2, ambiguous: 1, unknown: 0 } },
];

const replay = (events: readonly ImportEvent[]): LinkImportState =>
  events.reduce(
    (state, event) => linkImportReducer(state, { type: 'event', event }),
    LINK_IMPORT_START,
  );

const kindWord = (category: string) => (category === 'nature' ? categoryWord('nature') : '');
const noop = () => undefined;

function LinkScene({
  events,
  picking = false,
}: {
  readonly events: readonly ImportEvent[];
  readonly picking?: boolean;
}) {
  const [state, dispatch] = useReducer(linkImportReducer, events, replay);
  const [pick, setPick] = useState(picking);
  const chosen = chosenPlaces(state).length;
  return (
    <SearchView
      header={{ ...header(''), autoFocus: false }}
      scope={null}
      overlay={
        <>
          <LinkSheet
            state={state}
            guide="tokek"
            guideName="Tokek"
            kindWord={kindWord}
            tip={state.status === 'done' ? tipLine('Sat') : null}
            dayLabel={state.status === 'done' ? 'Sat 17' : null}
            chosen={chosen}
            saving={false}
            onToggle={(label) => dispatch({ type: 'toggle', label })}
            onPick={() => setPick(true)}
            onSearch={noop}
            onSave={noop}
            onPutOnDay={noop}
            onScreenshot={noop}
            onRetry={noop}
            onClose={noop}
          />
          {pick ? (
            <PickOneSheet
              label="the swing with the view"
              candidates={SWINGS}
              onPick={(poiId) => {
                dispatch({ type: 'pick', label: 'the swing with the view', poiId });
                setPick(false);
              }}
              onClose={() => setPick(false)}
            />
          ) : null}
        </>
      }
    >
      {null}
    </SearchView>
  );
}

export const LINK_SCENES: Readonly<Record<string, () => ReactNode>> = {
  '7d-3': () => <LinkScene events={EVENTS} />,
  '7d-3-reading': () => <LinkScene events={EVENTS.slice(0, 2)} />,
  '7d-3-pick-one': () => <LinkScene events={EVENTS} picking />,
  '7d-3-unsupported': () => (
    <LinkScene events={[{ event: 'error', data: { code: 'unsupported_link' } }]} />
  ),
};
