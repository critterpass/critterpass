/**
 * The Wikidata Query Service transport: a POSTed SPARQL query, retried with backoff on 429, 5xx
 * and a dropped connection, and on a truncated body. WDQS streams its JSON and, when a query hits its 60 s limit, stops
 * mid-stream and appends a Java `SPARQL-QUERY: … TimeoutException` trailer with status 200.
 */
export const WDQS_URL = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'CritterPass-destinations/1.0 (https://critterpass.app; ops@critterpass.app)';

export type Binding = Partial<Record<string, { value: string }>>;

export interface WikidataOptions {
  readonly fetch?: typeof fetch;
  readonly retries?: number;
  /** Retries of a page whose body came back truncated. */
  readonly truncatedRetries?: number;
  readonly retryDelayMs?: number;
}

/**
 * A SPARQL JSON body's bindings, or null when WDQS cut it off: it does not parse, or it carries
 * the `SPARQL-QUERY: … TimeoutException` trailer WDQS appends when it hits its time limit.
 */
export function parseSparqlBody(text: string): Binding[] | null {
  if (/TimeoutException|^SPARQL-QUERY:/mu.test(text)) return null;
  try {
    const body = JSON.parse(text) as { results?: { bindings?: Binding[] } };
    return body.results?.bindings ?? null;
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runQuery(
  query: string,
  page: string,
  options: WikidataOptions,
): Promise<Binding[]> {
  const fetchImpl = options.fetch ?? fetch;
  const retries = options.retries ?? 4;
  const truncatedRetries = options.truncatedRetries ?? 3;
  const backoff = (attempt: number) => (options.retryDelayMs ?? 5_000) * 2 ** attempt;
  let truncated = 0;
  for (let attempt = 0; ; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImpl(WDQS_URL, {
        method: 'POST',
        headers: {
          accept: 'application/sparql-results+json',
          'content-type': 'application/x-www-form-urlencoded',
          'user-agent': USER_AGENT,
        },
        body: new URLSearchParams({ query }).toString(),
        signal: AbortSignal.timeout(90_000),
      });
    } catch (error) {
      // A dropped connection or a timeout is retried like a 5xx.
      if (attempt >= retries) throw error;
      await sleep(backoff(attempt));
      continue;
    }
    if (response.ok) {
      const bindings = parseSparqlBody(await response.text());
      if (bindings !== null) return bindings;
      if (truncated >= truncatedRetries) {
        throw new Error(
          `Wikidata query ${page} failed: truncated response ${String(truncated + 1)} times`,
        );
      }
      await sleep(backoff(truncated));
      truncated += 1;
      continue;
    }
    if ((response.status !== 429 && response.status < 500) || attempt >= retries) {
      throw new Error(`Wikidata query ${page} failed: HTTP ${response.status}`);
    }
    const wait = Number(response.headers.get('retry-after'));
    await sleep(Number.isFinite(wait) && wait > 0 ? wait * 1000 : backoff(attempt));
  }
}

/** Runs tasks at most `limit` at once, keeping their order. */
export async function inPool<T>(tasks: readonly (() => Promise<T>)[], limit: number): Promise<T[]> {
  const out: T[] = new Array<T>(tasks.length);
  let next = 0;
  const work = async () => {
    for (let i = next++; i < tasks.length; i = next++) {
      const task = tasks[i];
      if (task !== undefined) out[i] = await task();
    }
  };
  await Promise.all(Array.from({ length: limit }, work));
  return out;
}
