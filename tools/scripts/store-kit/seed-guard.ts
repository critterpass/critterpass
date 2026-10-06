/**
 * What the demo crew seed checks before it writes anything: the api it was pointed at is a local
 * or staging one, and every supplier adapter there runs against its sandbox. Store screenshots are
 * captured from that crew, so it must never be created with production supplier keys or on the
 * production api.
 */

/** The `/health` field the seed reads: each supplier adapter's name and the mode it runs in. */
export type SupplierModes = Readonly<Record<string, string>>;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Why `base` must not be seeded, or undefined when it is a local or staging api. */
export function apiBaseIssue(base: string): string | undefined {
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return `not a url: ${base}`;
  }
  if (LOCAL_HOSTS.has(url.hostname)) return undefined;
  if (url.protocol !== 'https:') return `${url.hostname}: a remote api must be https`;
  // `api-staging-de92.up.railway.app`, `api.staging.critterpass.app`: "staging" is its own word.
  const staging = url.hostname.split(/[.-]/u).includes('staging');
  return staging ? undefined : `${url.hostname} is not a staging api`;
}

/**
 * Why the api behind this `/health` body must not be seeded, or undefined when every supplier
 * adapter reports `sandbox`. An api that does not report its adapters is refused: the seed cannot
 * tell what a booking there would reach.
 */
export function supplierModeIssue(health: unknown): string | undefined {
  const suppliers =
    typeof health === 'object' && health !== null
      ? (health as { suppliers?: unknown }).suppliers
      : undefined;
  if (typeof suppliers !== 'object' || suppliers === null || Array.isArray(suppliers)) {
    return 'the api does not report its supplier adapters on /health';
  }
  const entries = Object.entries(suppliers as Record<string, unknown>);
  if (entries.length === 0) return 'the api reports no supplier adapters on /health';
  const live = entries.filter(([, mode]) => mode !== 'sandbox').map(([name]) => name);
  return live.length === 0 ? undefined : `not in sandbox mode: ${live.sort().join(', ')}`;
}

/** Throws unless `base` is a local or staging api whose supplier adapters are all sandboxed. */
export async function assertSeedable(base: string, fetcher: typeof fetch): Promise<void> {
  const baseIssue = apiBaseIssue(base);
  if (baseIssue !== undefined) throw new Error(`refusing to seed: ${baseIssue}`);
  const response = await fetcher(`${base.replace(/\/+$/u, '')}/health`);
  if (!response.ok)
    throw new Error(`refusing to seed: /health answered ${String(response.status)}`);
  const modeIssue = supplierModeIssue(await response.json());
  if (modeIssue !== undefined) throw new Error(`refusing to seed: ${modeIssue}`);
}
