/**
 * Merges the per-area Sync Stream files in `infra/powersync/streams/*.yaml` into the one Sync Config
 * the PowerSync Service loads (`infra/powersync/sync-streams.yaml`, referenced by service.yaml).
 *
 *   pnpm tsx infra/powersync/build-config.ts           # regenerate sync-streams.yaml
 *   pnpm tsx infra/powersync/build-config.ts --check   # fail when sync-streams.yaml is stale
 *
 * Merge rules: global `with` CTEs are shared by every file and may be declared once only; a stream
 * named in several files gets the union of their queries and stream-level CTEs, and every file must
 * agree on its options (`auto_subscribe`, `priority`, `accept_potentially_dangerous_queries`). Any other key is rejected so a typo cannot silently
 * drop a filter.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import prettier from 'prettier';
import { parse, stringify } from 'yaml';

export const POWERSYNC_DIR = import.meta.dirname;
export const STREAMS_DIR = path.join(POWERSYNC_DIR, 'streams');
export const GENERATED_PATH = path.join(POWERSYNC_DIR, 'sync-streams.yaml');

/** Sync Streams config edition the pinned PowerSync Service version is validated against. */
const SYNC_CONFIG_EDITION = 3;

export interface StreamDefinition {
  readonly autoSubscribe: boolean;
  readonly priority: number | undefined;
  /** Acknowledges a filter on a client-chosen parameter alone (public data only). */
  readonly acceptPotentiallyDangerousQueries: boolean;
  /** Stream-level CTEs, name → single-SELECT SQL. */
  readonly with: Readonly<Record<string, string>>;
  readonly queries: readonly string[];
}

export interface SyncConfig {
  /** Global CTEs, name → single-SELECT SQL. */
  readonly with: Readonly<Record<string, string>>;
  readonly streams: Readonly<Record<string, StreamDefinition>>;
}

export interface StreamSource {
  readonly file: string;
  readonly text: string;
}

const STREAM_KEYS = new Set([
  'auto_subscribe',
  'priority',
  'accept_potentially_dangerous_queries',
  'with',
  'query',
  'queries',
]);
const FILE_KEYS = new Set(['with', 'streams']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(where: string, message: string): never {
  throw new Error(`${where}: ${message}`);
}

function sql(where: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') fail(where, 'expected a SQL string');
  return value.trim();
}

function parseCtes(where: string, value: unknown): Record<string, string> {
  if (value === undefined) return {};
  if (!isRecord(value)) fail(where, '`with` must map CTE names to SQL');
  const ctes: Record<string, string> = {};
  for (const [name, body] of Object.entries(value)) ctes[name] = sql(`${where}.with.${name}`, body);
  return ctes;
}

function parseStream(where: string, value: unknown): StreamDefinition {
  if (!isRecord(value)) fail(where, 'a stream must be a mapping');
  for (const key of Object.keys(value)) {
    if (!STREAM_KEYS.has(key)) fail(where, `unknown key \`${key}\``);
  }
  const {
    auto_subscribe: autoSubscribe,
    accept_potentially_dangerous_queries: acceptDangerous,
    priority,
    query,
    queries,
  } = value;
  if (autoSubscribe !== undefined && typeof autoSubscribe !== 'boolean') {
    fail(where, '`auto_subscribe` must be a boolean');
  }
  if (acceptDangerous !== undefined && typeof acceptDangerous !== 'boolean') {
    fail(where, '`accept_potentially_dangerous_queries` must be a boolean');
  }
  if (priority !== undefined && (typeof priority !== 'number' || !Number.isInteger(priority))) {
    fail(where, '`priority` must be an integer');
  }
  if ((query === undefined) === (queries === undefined)) {
    fail(where, 'declare exactly one of `query` or `queries`');
  }
  let list: string[];
  if (query !== undefined) {
    list = [sql(`${where}.query`, query)];
  } else {
    if (!Array.isArray(queries) || queries.length === 0) {
      fail(where, '`queries` must be a non-empty list');
    }
    list = queries.map((entry, index) => sql(`${where}.queries[${index}]`, entry));
  }
  return {
    autoSubscribe: autoSubscribe ?? false,
    priority,
    acceptPotentiallyDangerousQueries: acceptDangerous ?? false,
    with: parseCtes(where, value['with']),
    queries: list,
  };
}

function mergeCtes(
  where: string,
  into: Record<string, string>,
  from: Readonly<Record<string, string>>,
): void {
  for (const [name, body] of Object.entries(from)) {
    const existing = into[name];
    if (existing !== undefined && existing !== body) {
      fail(where, `CTE \`${name}\` is declared twice with different SQL`);
    }
    into[name] = body;
  }
}

/** Parses and merges area files (in the order given) into one Sync Config. */
export function mergeStreamSources(sources: readonly StreamSource[]): SyncConfig {
  const globalCtes: Record<string, string> = {};
  const streams = new Map<string, StreamDefinition>();

  for (const source of sources) {
    const doc: unknown = parse(source.text);
    if (!isRecord(doc)) fail(source.file, 'expected a mapping with `streams`');
    for (const key of Object.keys(doc)) {
      if (!FILE_KEYS.has(key)) fail(source.file, `unknown top-level key \`${key}\``);
    }
    mergeCtes(source.file, globalCtes, parseCtes(source.file, doc['with']));

    const fileStreams = doc['streams'];
    if (!isRecord(fileStreams)) fail(source.file, '`streams` must be a mapping');
    for (const [name, raw] of Object.entries(fileStreams)) {
      const where = `${source.file}: streams.${name}`;
      const stream = parseStream(where, raw);
      const existing = streams.get(name);
      if (existing === undefined) {
        streams.set(name, stream);
        continue;
      }
      if (
        existing.autoSubscribe !== stream.autoSubscribe ||
        existing.priority !== stream.priority ||
        existing.acceptPotentiallyDangerousQueries !== stream.acceptPotentiallyDangerousQueries
      ) {
        fail(where, 'stream options disagree with an earlier file');
      }
      const ctes = { ...existing.with };
      mergeCtes(where, ctes, stream.with);
      streams.set(name, {
        ...existing,
        with: ctes,
        queries: [...existing.queries, ...stream.queries],
      });
    }
  }

  for (const name of Object.keys(globalCtes)) {
    if (streams.has(name)) fail('streams', `global CTE \`${name}\` shadows a stream name`);
  }
  return { with: globalCtes, streams: Object.fromEntries(streams) };
}

/** Reads every `*.yaml` in the streams directory, sorted by file name for a stable output. */
export async function loadStreamSources(dir: string = STREAMS_DIR): Promise<StreamSource[]> {
  const files = (await readdir(dir)).filter((file) => file.endsWith('.yaml')).sort();
  if (files.length === 0) throw new Error(`${dir}: no stream files found`);
  return Promise.all(
    files.map(async (file) => ({ file, text: await readFile(path.join(dir, file), 'utf8') })),
  );
}

export async function loadSyncConfig(dir: string = STREAMS_DIR): Promise<SyncConfig> {
  return mergeStreamSources(await loadStreamSources(dir));
}

function toYamlStream(stream: StreamDefinition): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (stream.autoSubscribe) out['auto_subscribe'] = true;
  if (stream.priority !== undefined) out['priority'] = stream.priority;
  if (stream.acceptPotentiallyDangerousQueries) out['accept_potentially_dangerous_queries'] = true;
  if (Object.keys(stream.with).length > 0) out['with'] = stream.with;
  if (stream.queries.length === 1) out['query'] = stream.queries[0];
  else out['queries'] = stream.queries;
  return out;
}

const HEADER = [
  '# Generated by infra/powersync/build-config.ts from infra/powersync/streams/*.yaml.',
  '# Do not edit by hand: change the area file and run `pnpm tsx infra/powersync/build-config.ts`.',
].join('\n');

/** Renders the merged config as the YAML PowerSync loads, formatted exactly as prettier would. */
export async function renderSyncConfig(config: SyncConfig): Promise<string> {
  const body = stringify(
    {
      config: { edition: SYNC_CONFIG_EDITION },
      ...(Object.keys(config.with).length > 0 ? { with: config.with } : {}),
      streams: Object.fromEntries(
        Object.entries(config.streams).map(([name, stream]) => [name, toYamlStream(stream)]),
      ),
    },
    { lineWidth: 0 },
  );
  const options = (await prettier.resolveConfig(GENERATED_PATH)) ?? {};
  return prettier.format(`${HEADER}\n${body}`, { ...options, parser: 'yaml' });
}

async function main(argv: readonly string[]): Promise<void> {
  const check = argv.includes('--check');
  const rendered = await renderSyncConfig(await loadSyncConfig());
  if (!check) {
    await writeFile(GENERATED_PATH, rendered);
    console.log(`wrote ${path.relative(process.cwd(), GENERATED_PATH)}`);
    return;
  }
  const current = await readFile(GENERATED_PATH, 'utf8').catch(() => '');
  if (current !== rendered) {
    console.error(
      'infra/powersync/sync-streams.yaml is stale: run `pnpm tsx infra/powersync/build-config.ts`',
    );
    process.exitCode = 1;
    return;
  }
  console.log('ok    sync-streams.yaml matches infra/powersync/streams');
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
