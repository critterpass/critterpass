/**
 * The console's module registry: every area plugs in with `defineAdminModule` (navigation entry,
 * routes, optional home counters and user-detail panels) instead of editing the shell. Server twin:
 * `services/api/src/admin/registry.ts`. Two helpers cover the common shapes: `defineQueue` for
 * status-driven work queues and `defineCatalogue` for schema-driven editors.
 *
 * Example:
 *
 * ```ts
 * export const flagsModule = defineAdminModule({
 *   id: 'flags',
 *   area: 'flags',
 *   label: 'Flags & config',
 *   order: 30,
 *   routes: [{ path: 'flags', component: FlagsPage }],
 * });
 * ```
 */
import { canOpenAdminArea, type AdminArea, type AdminRole } from '@cp/domain';
import type { ComponentType, ReactNode } from 'react';
import type { z } from 'zod';

export interface AdminModuleRoute {
  /** Relative to the console root, TanStack Router style (`catalogue/$kind`). */
  readonly path: string;
  readonly component: ComponentType;
}

export interface HomeCounter {
  readonly id: string;
  readonly label: string;
  /** Where the counter links to (the module's queue). */
  readonly to: string;
  readonly load: () => Promise<number>;
  /** Counters above this value render in the warning colour. */
  readonly warnAbove?: number;
}

export interface UserPanel {
  readonly id: string;
  readonly label: string;
  readonly component: ComponentType<{ uid: string }>;
}

export interface AdminModule {
  readonly id: string;
  readonly area: AdminArea;
  readonly label: string;
  /** Navigation order; lower first. */
  readonly order: number;
  readonly routes: readonly AdminModuleRoute[];
  readonly homeCounters?: readonly HomeCounter[];
  readonly userPanels?: readonly UserPanel[];
}

export function defineAdminModule(module: AdminModule): AdminModule {
  if (module.routes.length === 0) throw new Error(`admin module ${module.id} has no routes`);
  return module;
}

/** Modules whose area the roles may open, in navigation order. */
export function visibleModules(
  modules: readonly AdminModule[],
  roles: readonly AdminRole[],
): readonly AdminModule[] {
  return [...modules]
    .filter((module) => canOpenAdminArea(roles, module.area).ok)
    .sort((a, b) => a.order - b.order);
}

/** The module whose first route owns a console path, if any. */
export function moduleForPath(
  modules: readonly AdminModule[],
  pathname: string,
): AdminModule | undefined {
  const first = pathname.split('/').filter(Boolean)[0];
  return modules.find((module) =>
    module.routes.some((route) => route.path.split('/')[0] === first),
  );
}

export interface QueueAction<Item> {
  readonly id: string;
  readonly label: string;
  /** Single-key shortcut while an item is focused (e.g. `a`, `h`, `r`). */
  readonly shortcut?: string;
  /** `approve` green, `warn` orange, `danger` pink, `outline` pink outline (asks first). */
  readonly tone?: 'default' | 'approve' | 'warn' | 'danger' | 'outline';
  /** Whether the action applies to this item (e.g. a verdict its kind supports); default always. */
  readonly available?: (item: Item) => boolean;
  /** Asks before running (destructive actions); the shortcut opens the same confirm. */
  readonly confirm?: (item: Item) => { title: string; body: string; label: string };
  readonly run: (item: Item) => Promise<void>;
}

export interface QueueDefinition<Item> {
  readonly kind: string;
  readonly statuses: readonly string[];
  readonly itemId: (item: Item) => string;
  readonly title: (item: Item) => ReactNode;
  readonly load: (
    status: string,
    cursor: string | undefined,
    /** The selected filter chip's id; undefined for "all". */
    filter?: string,
  ) => Promise<{
    items: Item[];
    next_cursor: string | null;
    /** Items in this status per filter chip, whatever chip is selected. */
    counts?: Readonly<Record<string, number>>;
  }>;
  readonly actions: readonly QueueAction<Item>[];
  readonly preview: (item: Item) => ReactNode;
  /** A label for each filter chip id the load's `counts` names; chips show only when set. */
  readonly filterLabel?: (id: string) => string;
  /** A column beside the focused item (who it concerns, what each action does). */
  readonly aside?: (item: Item) => ReactNode;
  /** A status tab's label; default the status with spaces. */
  readonly statusLabel?: (status: string) => string;
  /** The line above the list ("By due time"). */
  readonly listLabel?: string;
  /** Shown when the current status has no items. */
  readonly emptyTitle?: string;
}

export function defineQueue<Item>(queue: QueueDefinition<Item>): QueueDefinition<Item> {
  if (queue.statuses.length === 0) throw new Error(`queue ${queue.kind} has no statuses`);
  const shortcuts = queue.actions.flatMap((action) => (action.shortcut ? [action.shortcut] : []));
  if (new Set(shortcuts).size !== shortcuts.length) {
    throw new Error(`queue ${queue.kind} repeats a shortcut`);
  }
  return queue;
}

export interface CatalogueColumn<Item> {
  readonly id: string;
  readonly label: string;
  readonly value: (item: Item) => ReactNode;
}

export interface CatalogueDefinition<Item> {
  readonly kind: string;
  readonly label: string;
  /** Editable fields; the form is generated from this schema. */
  readonly schema: z.ZodObject;
  /** Fields shown but never editable (e.g. a guide's canonical colour). */
  readonly readOnly?: readonly string[];
  readonly columns: readonly CatalogueColumn<Item>[];
  readonly itemId: (item: Item) => string;
  readonly title: (item: Item) => string;
  /** The editable values of an item, in the schema's shape. */
  readonly values: (item: Item) => Record<string, unknown>;
  /** Whether new items can be created from the console. */
  readonly creatable: boolean;
  /** Optional preview beside the form (e.g. a map pin). */
  readonly preview?: ComponentType<{ values: Record<string, unknown> }>;
}

export function defineCatalogue<Item>(
  catalogue: CatalogueDefinition<Item>,
): CatalogueDefinition<Item> {
  for (const field of catalogue.readOnly ?? []) {
    if (!(field in catalogue.schema.shape)) {
      throw new Error(`catalogue ${catalogue.kind}: read-only field ${field} is not in the schema`);
    }
  }
  return catalogue;
}
