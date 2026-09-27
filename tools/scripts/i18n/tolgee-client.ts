/// <reference types="node" />
/**
 * A small, direct wrapper around the two Tolgee REST endpoints this pipeline needs (project API
 * keys scope the key to one project, so neither endpoint takes a project id in its path except the
 * key-import one, which does). No Tolgee project exists yet to record a real response from (see the
 * report); request shapes follow Tolgee's own published REST API docs (X-API-Key auth, POST
 * /v2/projects/{projectId}/keys/import, GET /v2/projects/export) and should be re-verified against
 * a live project once the founder creates one — this is why `tolgee-push`/`tolgee-pull` both run in
 * `--dry` mode until then, rather than only being testable by trusting these types blindly.
 */

export interface TolgeeConfig {
  readonly apiUrl: string;
  readonly apiKey: string;
  readonly projectId: string;
}

/** Reads TOLGEE_API_KEY/TOLGEE_PROJECT_ID (TOLGEE_API_URL optional, for a self-hosted instance);
 * `undefined` when either required variable is missing, so callers can fall back to `--dry`. */
export function loadTolgeeConfig(env: NodeJS.ProcessEnv = process.env): TolgeeConfig | undefined {
  const apiKey = env.TOLGEE_API_KEY;
  const projectId = env.TOLGEE_PROJECT_ID;
  if (!apiKey || !projectId) return undefined;
  return { apiUrl: env.TOLGEE_API_URL ?? 'https://app.tolgee.io', apiKey, projectId };
}

export interface TolgeeKeyImport {
  readonly name: string;
  readonly namespace?: string;
  /** locale -> source text. */
  readonly translations: Readonly<Record<string, string>>;
  /** Translator-facing context — the message's extracted `#.` comment (its `comment` macro field), if it has one. */
  readonly description?: string;
  readonly tags?: readonly string[];
}

/**
 * Imports new keys with their source translation. Tolgee does not update an existing key's
 * translations or tags on a repeat import, so a translator's in-progress work is never clobbered by
 * a routine push of the same (or a slightly changed) source text.
 */
export async function importKeys(
  config: TolgeeConfig,
  keys: readonly TolgeeKeyImport[],
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl(`${config.apiUrl}/v2/projects/${config.projectId}/keys/import`, {
    method: 'POST',
    headers: { 'X-API-Key': config.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ keys }),
  });
  if (!response.ok) {
    throw new Error(`Tolgee key import failed: ${String(response.status)} ${response.statusText} — ${await response.text()}`);
  }
}

export interface ExportOptions {
  /** Only these languages; omit for every language in the project. */
  readonly languages?: readonly string[];
  /** Only translations in these states; omit for every state (including untranslated). */
  readonly filterState?: readonly string[];
}

/** Exports the project's catalogs as a `.po`-per-locale zip archive (Tolgee always zips the
 * export regardless of the inner file format). */
export async function exportTranslations(
  config: TolgeeConfig,
  options: ExportOptions = {},
  fetchImpl: typeof fetch = fetch,
): Promise<ArrayBuffer> {
  const url = new URL(`${config.apiUrl}/v2/projects/export`);
  url.searchParams.set('format', 'PO');
  for (const language of options.languages ?? []) url.searchParams.append('languages', language);
  for (const state of options.filterState ?? []) url.searchParams.append('filterState', state);

  const response = await fetchImpl(url, { headers: { 'X-API-Key': config.apiKey } });
  if (!response.ok) {
    throw new Error(`Tolgee export failed: ${String(response.status)} ${response.statusText} — ${await response.text()}`);
  }
  return response.arrayBuffer();
}
