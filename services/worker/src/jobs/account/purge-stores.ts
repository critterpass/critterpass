/**
 * What a purged account leaves outside Postgres, one function per store, each safe to run again:
 * a second run finds nothing left and reports so.
 *
 * - The media bucket: every object under the person's own prefixes (uploads, avatars, feedback
 *   attachments, voice notes, signatures under `u/<uid>/`; "Download my data" zips under
 *   `exports/<uid>/`).
 * - The AI trace store (Langfuse): every trace recorded with the person's id.
 *
 * Analytics has its own module (`../../analytics-export/deletion`).
 */
export interface PrefixStore {
  list(prefix: string): Promise<string[]>;
  delete(key: string): Promise<void>;
}

/** The key spaces that belong to one person and nobody else. */
export function accountMediaPrefixes(uid: string): readonly string[] {
  return [`u/${uid}/`, `exports/${uid}/`];
}

/** Deletes every object under the person's prefixes; answers how many went. */
export async function deleteAccountMedia(store: PrefixStore, uid: string): Promise<number> {
  let deleted = 0;
  for (const prefix of accountMediaPrefixes(uid)) {
    for (const key of await store.list(prefix)) {
      // The listing is by prefix; never delete a key the prefix did not actually match.
      if (!key.startsWith(prefix)) continue;
      await store.delete(key);
      deleted += 1;
    }
  }
  return deleted;
}

export interface TraceStoreOptions {
  readonly publicKey: string;
  readonly secretKey: string;
  readonly host: string;
  readonly fetch?: typeof fetch;
}

const TRACE_PAGE_SIZE = 100;
/** A ceiling on one run; an account with more traces is finished by the next run. */
const TRACE_MAX_PAGES = 50;

interface TracePage {
  readonly data: readonly { readonly id: string }[];
  readonly meta: { readonly totalPages: number };
}

/**
 * Deletes every trace recorded for `uid`. The store deletes in the background, so the ids are
 * collected first and then deleted in batches; a trace already queued for deletion is harmless to
 * name again. Answers how many traces were named.
 */
export async function deleteAccountTraces(
  options: TraceStoreOptions,
  uid: string,
): Promise<number> {
  const send = options.fetch ?? fetch;
  const headers = {
    authorization: `Basic ${Buffer.from(`${options.publicKey}:${options.secretKey}`).toString('base64')}`,
    'content-type': 'application/json',
  };
  const ids: string[] = [];
  for (let page = 1; page <= TRACE_MAX_PAGES; page += 1) {
    const url = new URL('/api/public/traces', options.host);
    url.searchParams.set('userId', uid);
    url.searchParams.set('limit', String(TRACE_PAGE_SIZE));
    url.searchParams.set('page', String(page));
    const response = await send(url, { headers });
    if (!response.ok) throw new Error(`trace store lookup failed with HTTP ${response.status}`);
    const body = (await response.json()) as TracePage;
    ids.push(...body.data.map((trace) => trace.id));
    if (page >= body.meta.totalPages) break;
  }
  for (let start = 0; start < ids.length; start += TRACE_PAGE_SIZE) {
    const response = await send(new URL('/api/public/traces', options.host), {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ traceIds: ids.slice(start, start + TRACE_PAGE_SIZE) }),
    });
    if (!response.ok) throw new Error(`trace store delete failed with HTTP ${response.status}`);
  }
  return ids.length;
}
