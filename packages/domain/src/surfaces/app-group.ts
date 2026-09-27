/**
 * The App Group files the app and its extensions exchange commands and configuration through
 * (docs/api-contracts-async.md §4, §6). Every file is `{schema, generated_at, …}`, written
 * atomically, and readers ignore fields they do not know. These zod schemas are the one source:
 * packages/domain/scripts/gen-surfaces.ts generates the Swift and Kotlin types the native store
 * and extensions decode with.
 *
 * - `state/pending-actions.json`: commands an extension (widget, Live Activity intent, notification
 *   action, App Intent) queued while it could not reach `POST /v1/actions`. The extension generates
 *   the `op_id`; the app drains every entry into its own upload queue with the same `op_id` and
 *   `via`, so a command the extension also managed to send itself is applied once.
 * - `config/endpoints.json`: where the api lives for this build, and which schema version of each
 *   App Group file the app writes, so an extension can refuse a shape it predates.
 */
import { z } from 'zod';

import { ACTION_KEY_SCOPES } from '../auth/action-key-scopes';
import { commandNameSchema } from '../commands/envelope';
import { uuidV7Schema } from '../ids';

export const APP_GROUP_ID = 'group.app.critterpass';

export const APP_GROUP_PATHS = {
  pendingActions: 'state/pending-actions.json',
  endpoints: 'config/endpoints.json',
} as const;

export const PENDING_ACTIONS_SCHEMA_VERSION = 1;
export const ENDPOINTS_CONFIG_SCHEMA_VERSION = 1;

const isoDateTimeSchema = z.iso.datetime({ offset: true });

/** How an off-app surface reached the command (`actor.via` of the envelope the app builds). */
export const EXTENSION_ACTOR_VIA_VALUES = [
  'widget',
  'notif_action',
  'la_intent',
  'app_intent',
] as const;

/** One command queued by an extension: the envelope minus what only the app knows (uid, device). */
export const pendingActionSchema = z.object({
  op_id: uuidV7Schema,
  cmd: commandNameSchema,
  v: z.literal(1),
  via: z.enum(EXTENSION_ACTOR_VIA_VALUES),
  /** The action-key scope the extension would have used for `POST /v1/actions`. */
  scope: z.enum(ACTION_KEY_SCOPES),
  /** When the user acted (the envelope's `client_ts`). */
  client_ts: isoDateTimeSchema,
  base_version: z.number().int().positive().optional(),
  payload: z.record(z.string(), z.json()),
});
export type PendingAction = z.infer<typeof pendingActionSchema>;

export const pendingActionsFileSchema = z.object({
  schema: z.literal(PENDING_ACTIONS_SCHEMA_VERSION),
  generated_at: isoDateTimeSchema,
  actions: z.array(pendingActionSchema),
});
export type PendingActionsFile = z.infer<typeof pendingActionsFileSchema>;

export const APP_ENVIRONMENTS = ['development', 'staging', 'production'] as const;

export const endpointsConfigSchema = z.object({
  schema: z.literal(ENDPOINTS_CONFIG_SCHEMA_VERSION),
  generated_at: isoDateTimeSchema,
  env: z.enum(APP_ENVIRONMENTS),
  /** Base URL of the api, e.g. `https://api.critterpass.app` (extensions call `/v1/actions`). */
  api_base_url: z.url(),
  /** Schema version the app writes for each App Group file, keyed by file path. */
  schemas: z.record(z.string(), z.number().int().positive()),
});
export type EndpointsConfig = z.infer<typeof endpointsConfigSchema>;

/** What the app currently writes, for `config/endpoints.json`. */
export const APP_GROUP_SCHEMA_VERSIONS: Readonly<Record<string, number>> = {
  [APP_GROUP_PATHS.pendingActions]: PENDING_ACTIONS_SCHEMA_VERSION,
  [APP_GROUP_PATHS.endpoints]: ENDPOINTS_CONFIG_SCHEMA_VERSION,
  'snapshot/entitlements.json': 1,
};

export function buildEndpointsConfig(input: {
  readonly env: (typeof APP_ENVIRONMENTS)[number];
  readonly apiBaseUrl: string;
  readonly now: Date;
}): EndpointsConfig {
  return endpointsConfigSchema.parse({
    schema: ENDPOINTS_CONFIG_SCHEMA_VERSION,
    generated_at: input.now.toISOString(),
    env: input.env,
    api_base_url: input.apiBaseUrl,
    schemas: APP_GROUP_SCHEMA_VERSIONS,
  });
}

export type PendingActionsRead =
  | { readonly kind: 'ok'; readonly actions: readonly PendingAction[]; readonly invalid: string[] }
  /** Written by a newer build, or not JSON at all: leave the file alone. */
  | { readonly kind: 'unsupported' };

const fileHeaderSchema = z.object({ schema: z.number(), actions: z.array(z.unknown()) });

/**
 * Reads `state/pending-actions.json` entry by entry: a malformed entry never hides the valid ones.
 * `invalid` lists the `op_id`s of entries that can never be sent (so the drain can drop them).
 */
export function readPendingActions(text: string): PendingActionsRead {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { kind: 'unsupported' };
  }
  const header = fileHeaderSchema.safeParse(raw);
  if (!header.success || header.data.schema !== PENDING_ACTIONS_SCHEMA_VERSION) {
    return { kind: 'unsupported' };
  }
  const actions: PendingAction[] = [];
  const invalid: string[] = [];
  for (const entry of header.data.actions) {
    const parsed = pendingActionSchema.safeParse(entry);
    if (parsed.success) {
      actions.push(parsed.data);
    } else {
      const opId = (entry as { op_id?: unknown } | null)?.op_id;
      if (typeof opId === 'string') invalid.push(opId);
    }
  }
  return { kind: 'ok', actions, invalid };
}
