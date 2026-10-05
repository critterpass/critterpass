/**
 * The inbox kind registry (docs/api-contracts-async.md §2.2 `inbox.fanout`): which domain event
 * files which kind of inbox item, whether it needs the user, and which events settle it. This is
 * the pure half both processes read: the api and the worker enqueue `inbox.fanout` for every event
 * a kind is filed or settled by, in the transaction that appended it. Who receives an item and what
 * it carries are registered with the worker's fan-out (services/worker/src/jobs/inbox/).
 *
 * Resolve keys name the thing an item asks about, scoped to its user where the thing is personal
 * (`nudge:<uid>:poll:<id>`), so the same key settles it whichever surface acted: the inbox, a
 * notification action, a widget or the screen the deep link opens.
 */
import type { DomainEventType } from '../events/catalogue';

export type InboxSource = 'crew' | 'guide' | 'system';

export interface InboxResolver {
  /** The event that settles items of the kind. */
  readonly event: DomainEventType;
  /** The resolve keys it settles, from its payload; empty when it settles nothing. */
  readonly keys: (payload: Readonly<Record<string, unknown>>) => readonly string[];
}

export interface InboxKindSpec {
  /** Stored in `inbox_items.kind`; the client picks its renderer by it. */
  readonly kind: string;
  /** The event that files items of this kind. */
  readonly event: DomainEventType;
  readonly source: InboxSource;
  /** Action cards on top of the inbox (and the bell badge) versus the quiet EARLIER list. */
  readonly needsYou: boolean;
  readonly resolvedBy?: readonly InboxResolver[];
}

const kinds = new Map<string, InboxKindSpec>();

/** Registers one kind (a feature module, at load). A kind registers once. */
export function registerInboxKind(spec: InboxKindSpec): void {
  if (kinds.has(spec.kind)) throw new Error(`inbox kind ${spec.kind} is already registered`);
  kinds.set(spec.kind, spec);
}

/**
 * Registers the kinds that are not registered yet. A process that appends a kind's events calls
 * this with the kind lists it relies on: the package is marked free of side effects, so a bundle
 * that only reads the registry would otherwise drop the modules that fill it, and the events
 * would queue no fan-out.
 */
export function ensureInboxKinds(specs: readonly InboxKindSpec[]): void {
  for (const spec of specs) if (!kinds.has(spec.kind)) kinds.set(spec.kind, spec);
}

export function getInboxKind(kind: string): InboxKindSpec | undefined {
  return kinds.get(kind);
}

export function listInboxKinds(): readonly InboxKindSpec[] {
  return [...kinds.values()];
}

/** Kinds `event` files items of. */
export function inboxKindsForEvent(event: string): readonly InboxKindSpec[] {
  return [...kinds.values()].filter((spec) => spec.event === event);
}

/** Resolve keys `event` settles, across every registered kind. */
export function inboxResolveKeysForEvent(
  event: string,
  payload: Readonly<Record<string, unknown>>,
): readonly string[] {
  const keys = new Set<string>();
  for (const spec of kinds.values()) {
    for (const resolver of spec.resolvedBy ?? []) {
      if (resolver.event === event) for (const key of resolver.keys(payload)) keys.add(key);
    }
  }
  return [...keys];
}

/** True when `event` files or settles any inbox item: the hook enqueues a fan-out for it. */
export function isInboxEvent(event: string): boolean {
  for (const spec of kinds.values()) {
    if (spec.event === event) return true;
    if (spec.resolvedBy?.some((resolver) => resolver.event === event) === true) return true;
  }
  return false;
}

/** Test-only: forget every kind and re-register the built-in ones. */
export function resetInboxKindsForTests(builtIns: readonly InboxKindSpec[]): void {
  kinds.clear();
  for (const spec of builtIns) kinds.set(spec.kind, spec);
}
