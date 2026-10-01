/**
 * The saved hub: every destination and place the viewer saved, by list. Saves, moves and removals
 * made offline show at once from the queue. Lists can be made, renamed and deleted here; a saved
 * destination offers its offline pack.
 */
import { generateUuidV7 } from '@cp/domain';
import { router } from 'expo-router';
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';

import {
  createSavedListCommand,
  deleteSavedListCommand,
  moveSavedItemCommand,
  renameSavedListCommand,
  unsavePlaceCommand,
} from '../commands';
import { RegionPackCard } from '../components/region-pack-card';
import { SavedView, type ListChoice, type ListEditor } from '../components/saved-view';
import { exploreRoutes } from '../routes';
import { groupByDestination, listSummaries, type SavedRow } from '../saved-model';
import { SavedPlansSlot } from '../saved-plans-slot';
import { useSaved } from '../saved-queries';

export function SavedScreen() {
  const { rows, lists } = useSaved();
  const [choice, setChoice] = useState<ListChoice>('all');
  const [editing, setEditing] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [editor, setEditor] = useState<ListEditor>(null);
  const create = useCommand(createSavedListCommand);
  const rename = useCommand(renameSavedListCommand);
  const remove = useCommand(deleteSavedListCommand);
  const move = useCommand(moveSavedItemCommand);
  const unsave = useCommand(unsavePlaceCommand);

  const summaries = listSummaries(
    rows,
    lists.map((list) => list.name),
  );
  // A list that was renamed or deleted elsewhere falls back to everything.
  const shown: ListChoice =
    choice === 'all' || summaries.some((list) => list.name === choice) ? choice : 'all';
  const chosenList = lists.find((list) => list.name === shown);
  const taken = (name: string) =>
    summaries.some(
      (list) =>
        list.name !== null &&
        list.name.toLowerCase() === name.trim().toLowerCase() &&
        !(editor?.kind === 'rename' && list.name === shown),
    );

  const submit = () => {
    if (editor === null) return;
    const name = editor.name.trim();
    if (name === '') return;
    if (taken(name)) {
      setEditor({ ...editor, taken: true });
      return;
    }
    if (editor.kind === 'new') {
      void create.send({ list_id: generateUuidV7(), name });
      setEditor(null);
      return;
    }
    if (chosenList === undefined) return;
    void rename.send({ list_id: chosenList.id, name }).then((result) => {
      if (result.kind === 'rejected') setEditor({ kind: 'rename', name, taken: true });
      else {
        setEditor(null);
        if (result.kind === 'applied') setChoice(name);
      }
    });
  };

  const open = (row: SavedRow) => {
    if (row.subject === null) return;
    router.push(
      row.subject.kind === 'place'
        ? exploreRoutes.destination(row.refId)
        : exploreRoutes.place(row.refId, {
            destinationId: row.subject.destinationId ?? undefined,
          }),
    );
  };

  return (
    <SavedView
      lists={summaries}
      total={rows.length}
      choice={shown}
      onChoose={(next) => {
        setChoice(next);
        setEditor(null);
        setMovingId(null);
      }}
      groups={groupByDestination(rows, shown)}
      editing={editing}
      onToggleEditing={() => {
        setEditing((value) => !value);
        setMovingId(null);
        setEditor(null);
      }}
      movingId={movingId}
      onMove={(row) => setMovingId((current) => (current === row.id ? null : row.id))}
      onMoveTo={(row, list) => {
        void move.send({ item_id: row.id, list_name: list });
        setMovingId(null);
      }}
      onRemove={(row) => void unsave.send({ place_id: row.refId })}
      onOpen={open}
      editor={editor}
      onNewList={() => setEditor({ kind: 'new', name: '', taken: false })}
      onRenameList={() =>
        setEditor({ kind: 'rename', name: typeof shown === 'string' ? shown : '', taken: false })
      }
      onDeleteList={() => {
        if (chosenList === undefined) return;
        void remove.send({ list_id: chosenList.id });
        setChoice('all');
      }}
      onEditorChange={(name) =>
        setEditor((current) => (current === null ? null : { ...current, name, taken: false }))
      }
      onEditorSubmit={submit}
      onEditorCancel={() => setEditor(null)}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      onExplore={() => router.replace(exploreRoutes.home())}
      renderPack={(destination) => (
        <RegionPackCard
          destinationId={destination.id}
          destinationSlug={destination.slug}
          destinationName={destination.name}
        />
      )}
      plans={<SavedPlansSlot />}
    />
  );
}
