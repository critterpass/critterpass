/**
 * Entries other features add to the chat's "+" menu (a poll, an expense, a meet-up, a location),
 * listed under the built-in photo and voice choices by every view of the menu.
 */
export interface AttachEntry {
  readonly id: string;
  readonly title: () => string;
  readonly onPress: (crewId: string) => void;
}

const entries = new Map<string, AttachEntry>();

/** Adds an entry under the built-in ones; returns its removal. */
export function registerAttachEntry(entry: AttachEntry): () => void {
  entries.set(entry.id, entry);
  return () => {
    if (entries.get(entry.id) === entry) entries.delete(entry.id);
  };
}

/** Every registered entry, in registration order. */
export function attachEntries(): readonly AttachEntry[] {
  return [...entries.values()];
}
