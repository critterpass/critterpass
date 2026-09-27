import { cpAppGroupNativeModule } from './src/CpAppGroupModule';
import type { PendingAction } from './src/CpAppGroup.types';

export type { PendingAction };

/**
 * Writes a schema-versioned JSON snapshot to the shared container
 * (`snapshot/<key>.json` — api-contracts-async.md §6). `json` must already be the fully-formed
 * `{ schema, generated_at, ... }` envelope; this module does not validate it — the caller's zod
 * schema (`packages/domain`) is the validation boundary.
 */
export function writeSnapshot(key: string, json: string): void {
  cpAppGroupNativeModule.writeSnapshot(key, json);
}

/** Writes a PNG (base64-encoded) to the shared container's `assets/<key>.png`. */
export function writeImage(key: string, pngBase64: string): void {
  cpAppGroupNativeModule.writeImage(key, pngBase64);
}

/** Writes `config/endpoints.json` (a `{ schema, generated_at, ... }` envelope) for extensions. */
export function writeEndpointsConfig(json: string): void {
  cpAppGroupNativeModule.writeEndpointsConfig(json);
}

/** Raw JSON text of `state/pending-actions.json`; see {@link readOutboxActions} for parsed use. */
export function readOutbox(): string {
  return cpAppGroupNativeModule.readOutbox();
}

interface OutboxFile {
  actions?: PendingAction[];
}

/** Parses the outbox file and returns the queued actions an extension left behind. */
export function readOutboxActions(): PendingAction[] {
  const parsed = JSON.parse(readOutbox()) as OutboxFile;
  return Array.isArray(parsed.actions) ? parsed.actions : [];
}

/**
 * Removes the listed entries under file coordination, keeping anything an extension appended
 * meanwhile; returns how many entries remain.
 */
export function removeOutboxActions(opIds: readonly string[]): number {
  return cpAppGroupNativeModule.removeOutboxActions([...opIds]);
}

/** Drops every queued entry (account switch). */
export function clearOutbox(): void {
  cpAppGroupNativeModule.clearOutbox();
}

/** The outbox in the shape the app's drain (`src/data/commands/drain-extension-outbox.ts`) takes. */
export const appGroupOutbox = {
  read: readOutbox,
  remove: removeOutboxActions,
  clear: clearOutbox,
};

/** Tells WidgetKit (iOS) / the Glance receiver (Android) to reload from the latest snapshot. */
export function reloadWidgets(): void {
  cpAppGroupNativeModule.reloadWidgets();
}
