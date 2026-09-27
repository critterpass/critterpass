/**
 * Building and loading content releases. `buildRelease` stamps the checksum; `loadRelease`
 * refuses a release whose checksum does not match its contents, whose items fail their kind's
 * schema, or whose item keys repeat. Consumers (the publish job, bake, the app bundle) only ever
 * read releases through `loadRelease`.
 */
import { createHash } from 'node:crypto';

import {
  CONTENT_ITEM_SCHEMAS,
  itemRef,
  releaseEnvelopeSchema,
  type ContentItem,
  type ContentKind,
  type Release,
  type ReleaseEnvelope,
} from './schemas/release';

export class ReleaseLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReleaseLoadError';
  }
}

/** JSON with object keys sorted at every level, so equal content always hashes the same. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function releaseChecksum(
  kind: ContentKind,
  version: number,
  items: readonly unknown[],
): string {
  return sha256Hex(canonicalJson({ kind, version, items }));
}

export function buildRelease<K extends ContentKind>(
  input: Omit<Release<K>, 'checksum'>,
): Release<K> {
  return { ...input, checksum: releaseChecksum(input.kind, input.version, input.items) };
}

export function parseItems<K extends ContentKind>(
  kind: K,
  raw: readonly unknown[],
): ContentItem<K>[] {
  const schema = CONTENT_ITEM_SCHEMAS[kind];
  const seen = new Set<string>();
  return raw.map((value, index) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new ReleaseLoadError(
        `${kind} item ${index}: ${first?.path.join('.') ?? ''} ${first?.message ?? 'is invalid'}`.trim(),
      );
    }
    const item = parsed.data as ContentItem<K>;
    const ref = itemRef(kind, item);
    if (seen.has(ref)) throw new ReleaseLoadError(`${kind} item ${ref} appears twice`);
    seen.add(ref);
    return item;
  });
}

/** Parses and verifies a release; `kind` pins what the caller expects to load. */
export function loadRelease<K extends ContentKind>(raw: unknown, kind: K): Release<K> {
  const envelope: ReleaseEnvelope = releaseEnvelopeSchema.parse(raw);
  if (envelope.kind !== kind) {
    throw new ReleaseLoadError(`expected a ${kind} release, got ${envelope.kind}`);
  }
  const expected = releaseChecksum(envelope.kind, envelope.version, envelope.items);
  if (expected !== envelope.checksum) {
    throw new ReleaseLoadError(`${kind} v${envelope.version} checksum does not match its items`);
  }
  return { ...envelope, kind, items: parseItems(kind, envelope.items) };
}
