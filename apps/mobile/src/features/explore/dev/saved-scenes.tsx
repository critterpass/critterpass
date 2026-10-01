/**
 * Lab scenes for Explore's front page and the saved hub: a fresh account (nothing saved, nothing
 * downloaded), a traveller with saved places in lists and an offline pack, edit mode with a move
 * open, a list being renamed to a name already taken, and each state of the offline pack. Chips,
 * edit mode and the editor work; nothing is sent.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { tokens } from '@cp/design-tokens';
import { useState, type ReactNode } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';

import { ExploreHomeView } from '../components/explore-home-view';
import { RegionPackCardView } from '../components/region-pack-card';
import { SavedView, type ListChoice, type ListEditor } from '../components/saved-view';
import type { OfflinePackStatus } from '../data/use-offline-pack';
import { destinationCards } from '../home-model';
import {
  ALL_LISTS,
  groupByDestination,
  listSummaries,
  type SavedRow,
  type SavedSubject,
} from '../saved-model';

const DESTINATIONS = [
  { id: 'bali', slug: 'bali', name: 'Bali', guide_slug: 'tokek' },
  { id: 'kyoto', slug: 'kyoto', name: 'Kyoto', guide_slug: 'pon' },
  { id: 'iceland', slug: 'iceland', name: 'Iceland', guide_slug: 'lundi' },
  { id: 'mexico-city', slug: 'mexico-city', name: 'Mexico City', guide_slug: 'ajo' },
  { id: 'lisbon', slug: 'lisbon', name: 'Lisbon', guide_slug: 'sardi' },
  { id: 'cusco', slug: 'cusco', name: 'Cusco', guide_slug: 'paco' },
  { id: 'da-nang', slug: 'da-nang', name: 'Đà Nẵng', guide_slug: 'chava' },
];

const destination = (id: string, name: string): SavedSubject => ({
  kind: 'place',
  name,
  category: null,
  destinationId: id,
  destinationName: name,
  destinationSlug: id,
});
const place = (name: string, category: string, id: string, where: string): SavedSubject => ({
  kind: 'poi',
  name,
  category,
  destinationId: id,
  destinationName: where,
  destinationSlug: id,
});
const saved = (id: string, subject: SavedSubject | null, listName: string | null = null) =>
  ({ id, refId: id, listName, subject, pending: false }) satisfies SavedRow;

const ROWS: readonly SavedRow[] = [
  saved('kyoto', destination('kyoto', 'Kyoto')),
  saved('fushimi', place('Fushimi Inari', 'temple_shrine', 'kyoto', 'Kyoto'), 'Mornings'),
  saved('nishiki', place('Nishiki Market', 'market', 'kyoto', 'Kyoto')),
  saved('son-tra', place('Bán đảo Sơn Trà và chùa Linh Ứng', 'nature', 'da-nang', 'Đà Nẵng')),
  saved('my-khe', place('Bãi biển Mỹ Khê', 'beach', 'da-nang', 'Đà Nẵng'), 'Mornings'),
  saved('elsewhere', null),
];
const LISTS = ['Mornings', 'Quán ăn phải thử cùng cả nhóm'];

function HomeScene(props: { readonly fresh?: boolean; readonly loading?: boolean }) {
  useLocale();
  const cards = destinationCards(
    props.loading === true ? [] : DESTINATIONS,
    tokens.guide.order,
    new Set(props.fresh === true ? [] : ['kyoto']),
    props.fresh === true ? [] : ['da-nang-3.pmtiles', 'kyoto-3.pmtiles'],
  );
  return (
    <ExploreHomeView
      cards={cards}
      loading={props.loading ?? false}
      offline={false}
      savedCount={props.fresh === true || props.loading === true ? 0 : ROWS.length}
      onBack={() => undefined}
      onOpen={() => undefined}
      onSaved={() => undefined}
      onSearch={() => undefined}
    />
  );
}

interface SavedSpec {
  readonly rows?: readonly SavedRow[];
  readonly choice?: ListChoice;
  readonly editing?: boolean;
  readonly movingId?: string;
  readonly editor?: ListEditor;
  readonly pack?: OfflinePackStatus;
}

function SavedScene({ spec }: { readonly spec: SavedSpec }) {
  useLocale();
  const rows = spec.rows ?? ROWS;
  const [choice, setChoice] = useState<ListChoice>(spec.choice ?? ALL_LISTS);
  const [editing, setEditing] = useState(spec.editing ?? false);
  const [movingId, setMovingId] = useState<string | null>(spec.movingId ?? null);
  const [editor, setEditor] = useState<ListEditor>(spec.editor ?? null);
  const [pack, setPack] = useState<OfflinePackStatus>(spec.pack ?? 'none');
  return (
    <SavedView
      lists={listSummaries(rows, LISTS)}
      total={rows.length}
      choice={choice}
      onChoose={setChoice}
      groups={groupByDestination(rows, choice)}
      editing={editing}
      onToggleEditing={() => setEditing((value) => !value)}
      movingId={movingId}
      onMove={(row) => setMovingId((current) => (current === row.id ? null : row.id))}
      onMoveTo={() => setMovingId(null)}
      onRemove={() => undefined}
      onOpen={() => undefined}
      editor={editor}
      onNewList={() => setEditor({ kind: 'new', name: '', taken: false })}
      onRenameList={() => setEditor({ kind: 'rename', name: choice ?? '', taken: false })}
      onDeleteList={() => setChoice(ALL_LISTS)}
      onEditorChange={(name) =>
        setEditor((current) => (current === null ? null : { ...current, name, taken: false }))
      }
      onEditorSubmit={() => setEditor(null)}
      onEditorCancel={() => setEditor(null)}
      onBack={() => undefined}
      onExplore={() => undefined}
      renderPack={(where) => (
        <RegionPackCardView
          destinationName={where.name}
          status={pack}
          progress={0.42}
          bytes={pack === 'downloaded' ? 48_300_000 : null}
          onDownload={() => setPack('downloading')}
          onRemove={() => setPack('none')}
        />
      )}
    />
  );
}

const SAVED_SPECS: Readonly<Record<string, SavedSpec>> = {
  saved: {},
  'saved-empty': { rows: [] },
  'saved-editing': { editing: true, movingId: 'my-khe' },
  'saved-list': {
    choice: 'Mornings',
    editing: true,
    editor: { kind: 'rename', name: 'Quán ăn phải thử cùng cả nhóm', taken: true },
  },
  'saved-pack-downloading': { pack: 'downloading' },
  'saved-pack-downloaded': { pack: 'downloaded' },
  'saved-pack-failed': { pack: 'failed' },
};

export const SAVED_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'explore-home': () => <HomeScene />,
  'explore-home-fresh': () => <HomeScene fresh />,
  'explore-home-loading': () => <HomeScene loading />,
  ...Object.fromEntries(
    Object.entries(SAVED_SPECS).map(([name, spec]) => [name, () => <SavedScene spec={spec} />]),
  ),
};
