/**
 * The saved hub: every destination and place the viewer saved, by list. Saves, moves and removals
 * made offline show at once from the queue. Lists can be made, renamed and deleted here; a saved
 * destination offers its offline pack.
 */
import { generateUuidV7 } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { goBackOr } from '@/lib/navigation/back';
import { toast } from '@/motion/island-toast';
import { Sheet } from '@/ui/sheet/Sheet';
import { ConfirmSheet } from '@/ui/states/ConfirmSheet';

import {
  createSavedListCommand,
  deleteSavedListCommand,
  moveSavedItemCommand,
  renameSavedListCommand,
  savePlaceCommand,
  unsavePlaceCommand,
} from '../commands';
import { RegionPackCard } from '../components/region-pack-card';
import { SavedView, type ListChoice, type ListEditor } from '../components/saved-view';
import { exploreRoutes } from '../routes';
import { ALL_LISTS, groupByDestination, listSummaries, type SavedRow } from '../saved-model';
import { SavedPlansSlot } from '../saved-plans-slot';
import { useSaved } from '../saved-queries';

export function SavedScreen() {
  const { rows, lists, loaded, settled } = useSaved();
  const [deleting, setDeleting] = useState(false);
  const save = useCommand(savePlaceCommand);
  const [choice, setChoice] = useState<ListChoice>(ALL_LISTS);
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
    choice === ALL_LISTS || summaries.some((list) => list.name === choice) ? choice : ALL_LISTS;
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

  const deletingName = chosenList?.name ?? '';
  const view = (
    <SavedView
      loading={!loaded}
      settling={!settled}
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
      onRemove={(row) => {
        void unsave.send({ place_id: row.refId });
        const name = row.subject?.name ?? '';
        toast.show({
          // eslint-disable-next-line lingui/no-unlocalized-strings -- a toast key, never copy.
          id: `explore-saved-removed-${row.refId}`,
          title:
            name === ''
              ? t({ id: 'explore.saved.removed', message: 'Removed from Saved' })
              : t({ id: 'explore.saved.removedNamed', message: `${name} removed from Saved` }),
          action: {
            label: t({ id: 'explore.saved.undo', message: 'Undo' }),
            onPress: () =>
              void save.send({
                place_id: row.refId,
                ...(row.listName === null ? {} : { list_name: row.listName }),
              }),
          },
        });
      }}
      onOpen={open}
      editor={editor}
      onNewList={() => setEditor({ kind: 'new', name: '', taken: false })}
      onRenameList={() => setEditor({ kind: 'rename', name: shown ?? '', taken: false })}
      onDeleteList={() => {
        if (chosenList !== undefined) setDeleting(true);
      }}
      onEditorChange={(name) =>
        setEditor((current) => (current === null ? null : { ...current, name, taken: false }))
      }
      onEditorSubmit={submit}
      onEditorCancel={() => setEditor(null)}
      onBack={() => goBackOr()}
      onExplore={() => router.dismissTo(exploreRoutes.home())}
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
  return (
    <>
      {view}
      {deleting && chosenList !== undefined ? (
        <Sheet
          detents={['fit']}
          onDismiss={() => setDeleting(false)}
          testID="explore-saved-delete-sheet"
        >
          <ConfirmSheet
            mode="button"
            title={t({
              id: 'explore.saved.deleteTitle',
              message: `Delete the list "${deletingName}"?`,
            })}
            consequences={[
              t({ id: 'explore.saved.deleteKeeps', message: 'Its places stay in Saved.' }),
            ]}
            confirmLabel={t({ id: 'explore.saved.deleteList', message: 'Delete list' })}
            onConfirm={() => {
              setDeleting(false);
              void remove.send({ list_id: chosenList.id });
              setChoice(ALL_LISTS);
            }}
            onCancel={() => setDeleting(false)}
            testID="explore-saved-delete-confirm"
          />
        </Sheet>
      ) : null}
    </>
  );
}
