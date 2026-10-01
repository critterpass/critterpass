/**
 * Saved places, apart from any rendering: the synced rows with the queue's saves, unsaves and
 * moves applied (so what was tapped offline shows at once), how many each list holds, and the
 * rows of one list grouped by destination, the destination itself first.
 */
export type SavedItemKind = 'place' | 'poi';

/** What the device knows about a saved destination or place. */
export interface SavedSubject {
  readonly kind: SavedItemKind;
  readonly name: string;
  readonly category: string | null;
  readonly destinationId: string | null;
  readonly destinationName: string | null;
  readonly destinationSlug: string | null;
}

export interface SavedRow {
  /** The saved item's id; a queued save uses its command id until the row syncs. */
  readonly id: string;
  readonly refId: string;
  /** Null is the default "Saved" list. */
  readonly listName: string | null;
  /** Null while the place's own row is not on this phone. */
  readonly subject: SavedSubject | null;
  /** Still waiting in the offline queue. */
  readonly pending: boolean;
}

export type QueuedSavedOp =
  | {
      readonly cmd: 'save_place';
      readonly id: string;
      readonly placeId: string;
      readonly listName: string | null;
    }
  | { readonly cmd: 'unsave_place'; readonly placeId: string }
  | { readonly cmd: 'move_saved_item'; readonly itemId: string; readonly listName: string | null };

/** The synced rows as they will be once the queue (oldest first) has uploaded. */
export function applyQueue(
  synced: readonly SavedRow[],
  queue: readonly QueuedSavedOp[],
  subjects: ReadonlyMap<string, SavedSubject>,
): SavedRow[] {
  let rows = [...synced];
  for (const op of queue) {
    if (op.cmd === 'unsave_place') {
      rows = rows.filter((row) => row.refId !== op.placeId);
    } else if (op.cmd === 'move_saved_item') {
      rows = rows.map((row) => (row.id === op.itemId ? { ...row, listName: op.listName } : row));
    } else {
      const existing = rows.find((row) => row.refId === op.placeId);
      if (existing === undefined) {
        rows.push({
          id: op.id,
          refId: op.placeId,
          listName: op.listName,
          subject: subjects.get(op.placeId) ?? null,
          pending: true,
        });
      } else if (op.listName !== null) {
        // Saving again into a list moves it there.
        rows = rows.map((row) => (row === existing ? { ...row, listName: op.listName } : row));
      }
    }
  }
  return rows;
}

export interface ListSummary {
  /** Null is the default "Saved" list. */
  readonly name: string | null;
  readonly count: number;
}

/** The default list first, then the user's lists in their order, then any list only items name. */
export function listSummaries(rows: readonly SavedRow[], lists: readonly string[]): ListSummary[] {
  const names = [...lists];
  for (const row of rows) {
    if (row.listName !== null && !names.includes(row.listName)) names.push(row.listName);
  }
  const count = (name: string | null) => rows.filter((row) => row.listName === name).length;
  return [
    { name: null, count: count(null) },
    ...names.map((name) => ({ name, count: count(name) })),
  ];
}

export interface SavedGroup {
  readonly destinationId: string;
  readonly destinationName: string;
  readonly destinationSlug: string | null;
  /** The saved destination itself, when it is saved (in the list shown). */
  readonly destination: SavedRow | null;
  readonly places: readonly SavedRow[];
}

export interface SavedGroups {
  readonly groups: readonly SavedGroup[];
  /** Saved places whose own rows are not on this phone yet. */
  readonly unknown: number;
}

/** One list's rows (or every row for `'all'`) grouped by destination, in name order. */
export function groupByDestination(
  rows: readonly SavedRow[],
  list: string | null | 'all',
): SavedGroups {
  const shown = rows.filter((row) => list === 'all' || row.listName === list);
  const groups = new Map<string, { -readonly [K in keyof SavedGroup]: SavedGroup[K] }>();
  let unknown = 0;
  for (const row of shown) {
    const subject = row.subject;
    if (subject === null || subject.destinationId === null) {
      unknown += 1;
      continue;
    }
    const group = groups.get(subject.destinationId) ?? {
      destinationId: subject.destinationId,
      destinationName: subject.destinationName ?? subject.name,
      destinationSlug: subject.destinationSlug,
      destination: null,
      places: [],
    };
    if (subject.kind === 'place') group.destination = row;
    else group.places = [...group.places, row];
    groups.set(subject.destinationId, group);
  }
  return {
    groups: [...groups.values()]
      .map((group) => ({
        ...group,
        places: [...group.places].sort((a, b) =>
          (a.subject?.name ?? '').localeCompare(b.subject?.name ?? ''),
        ),
      }))
      .sort((a, b) => a.destinationName.localeCompare(b.destinationName)),
    unknown,
  };
}
