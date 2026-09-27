/**
 * Privacy is decided per table, never per column (docs/data-model-sync-and-privacy.md §1): a
 * table's class alone decides whether it can enter the PowerSync publication and whether
 * `guide_reader` can see it. `columns` exists only for the handful of tables that mix classes
 * (docs/data-model.md §1.1); even then no single row mixes a C3+ value with a lower one.
 *
 * Each table registers its own class where it is defined (schema/<area>.ts), once, at module load;
 * this registry is the single source both the publication allow-list and the event-payload privacy
 * test read from.
 */

export const PRIVACY_CLASSES = ['C0', 'C1', 'C2', 'C3', 'C4', 'C5'] as const;
export type PrivacyClass = (typeof PRIVACY_CLASSES)[number];

export interface TablePrivacy {
  readonly class: PrivacyClass;
  /** Column-level overrides for the few tables whose columns are not all the same class. */
  readonly columns?: Readonly<Record<string, PrivacyClass>>;
}

const registry = new Map<string, TablePrivacy>();

/** Registers a table's privacy class. Called once, by the schema module that defines the table. */
export function registerTablePrivacy(table: string, privacy: TablePrivacy): void {
  if (registry.has(table)) {
    throw new Error(`privacy class already registered for table "${table}"`);
  }
  registry.set(table, privacy);
}

export function getTablePrivacy(table: string): TablePrivacy | undefined {
  return registry.get(table);
}

export function isRegisteredTable(table: string): boolean {
  return registry.has(table);
}

/** C0-C2 tables may enter the PowerSync publication (docs/data-model-sync-and-privacy.md §1); C3+ never do. */
export function isPublishableClass(privacyClass: PrivacyClass): boolean {
  return privacyClass === 'C0' || privacyClass === 'C1' || privacyClass === 'C2';
}

export function listRegisteredTables(): readonly string[] {
  return [...registry.keys()].sort();
}

/** Test-only: clears every registration so one test file's fixtures cannot leak into another. */
export function resetPrivacyRegistryForTests(): void {
  registry.clear();
}
