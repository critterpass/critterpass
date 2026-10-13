/**
 * The saved hub: every destination and place the viewer saved, by list. Saves, moves and removals
 * made offline show at once from the queue. Lists can be made, renamed and deleted here; a saved
 * destination offers its offline pack.
 */
import { generateUuidV7 } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useState, type ComponentType } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { goBackOr } from '@/lib/navigation/back';
import { toast } from '@/motion/island-toast';

import {
  createSavedListCommand,
  deleteSavedListCommand,
  moveSavedItemCommand,
  renameSavedListCommand,
  savePlaceCommand,
  unsavePlaceCommand,
} from '../commands';
import { RegionPackCard } from '../premium/components/region-pack-card';

import { exploreRoutes } from '../routes';
import { ALL_LISTS, groupByDestination, listSummaries, type SavedRow } from '../saved-model';
import { SavedPlansSlot } from '../saved-plans-slot';
import { useSaved } from '../saved-queries';
import type { ReactNode } from 'react';
import { type ListSummary, type SavedGroups } from '../saved-model';

export interface SavedScreenProps {
  /** The drawing of the saved hub. */
  readonly View: ComponentType<SavedViewProps>;
  /** Asks before deleting a list, resolving true to delete. */
  readonly confirmDelete: (name: string) => Promise<boolean>;
}

export function SavedScreen({ View, confirmDelete }: SavedScreenProps) {
  const { rows, lists, loaded, settled } = useSaved();
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

  const view = (
    <View
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
        if (chosenList === undefined) return;
        void confirmDelete(chosenList.name).then((yes) => {
          if (!yes) return;
          void remove.send({ list_id: chosenList.id });
          setChoice(ALL_LISTS);
        });
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
  return view;
}

/** Which list is shown: every list (`ALL_LISTS`), the default one (null) or a named one. */
export type ListChoice = string | null;

export interface SavedViewProps {
  /** The saved rows have not been read yet: neither the rows nor "nothing saved" is known. */
  readonly loading?: boolean | undefined;
  /** Places only the api knows are still being read: their count is not said yet. */
  readonly settling?: boolean | undefined;
  readonly lists: readonly ListSummary[];
  readonly total: number;
  readonly choice: ListChoice;
  readonly onChoose: (choice: ListChoice) => void;
  readonly groups: SavedGroups;
  readonly editing: boolean;
  readonly onToggleEditing: () => void;
  /** The row whose "move to" lists are open. */
  readonly movingId: string | null;
  readonly onMove: (row: SavedRow) => void;
  readonly onMoveTo: (row: SavedRow, list: string | null) => void;
  readonly onRemove: (row: SavedRow) => void;
  readonly onOpen: (row: SavedRow) => void;
  readonly editor: ListEditor;
  readonly onNewList: () => void;
  readonly onRenameList: () => void;
  readonly onDeleteList: () => void;
  readonly onEditorChange: (name: string) => void;
  readonly onEditorSubmit: () => void;
  readonly onEditorCancel: () => void;
  readonly onBack: () => void;
  /** Opens Explore to find something to save; absent while that screen is not in the app. */
  readonly onExplore?: (() => void) | undefined;
  /** The offline pack of a saved destination. */
  readonly renderPack: (destination: {
    readonly id: string;
    readonly slug: string;
    readonly name: string;
  }) => ReactNode;
  readonly plans?: ReactNode;
}

export type ListEditor = {
  readonly kind: 'new' | 'rename';
  readonly name: string;
  /** The viewer already has a list with this name. */
  readonly taken: boolean;
} | null;
