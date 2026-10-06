/**
 * HTTP security headers of the staging site and API, read with one plain GET each (no scanning):
 *
 *   pnpm tsx tools/scripts/security/headers.ts [--web <url>] [--api <url>] [--json]
 *
 * A missing required header fails the run; recommended headers and disclosure headers are listed
 * as notes. Results go into docs/compliance/security-review.md.
 */
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export type Surface = 'web' | 'api';
export interface HeaderFinding {
  readonly level: 'fail' | 'note';
  readonly header: string;
  readonly message: string;
}

const HSTS_MIN_SECONDS = 15_552_000; // 180 days

/** Judges one response's headers (lower-case names) for an HTML site or a JSON API. */
export function evaluateHeaders(
  surface: Surface,
  headers: Readonly<Record<string, string | undefined>>,
): HeaderFinding[] {
  const findings: HeaderFinding[] = [];
  const add = (level: HeaderFinding['level'], header: string, message: string) =>
    findings.push({ level, header, message });

  const hsts = headers['strict-transport-security'];
  const maxAge = Number(/max-age=(\d+)/iu.exec(hsts ?? '')?.[1] ?? Number.NaN);
  if (!hsts) add('fail', 'strict-transport-security', 'missing');
  else if (!(maxAge >= HSTS_MIN_SECONDS)) {
    add('fail', 'strict-transport-security', `max-age below 180 days: ${hsts}`);
  }

  if (headers['x-content-type-options']?.toLowerCase() !== 'nosniff') {
    add('fail', 'x-content-type-options', 'missing or not "nosniff"');
  }

  if (surface === 'web') {
    const csp = headers['content-security-policy'];
    if (!csp) add('fail', 'content-security-policy', 'missing');
    else if (/script-src[^;]*'unsafe-eval'/iu.test(csp)) {
      add('note', 'content-security-policy', "script-src allows 'unsafe-eval'");
    }
    const framed = /frame-ancestors/iu.test(csp ?? '') || Boolean(headers['x-frame-options']);
    if (!framed) add('fail', 'x-frame-options', 'no frame-ancestors directive or X-Frame-Options');
    if (!headers['referrer-policy']) add('note', 'referrer-policy', 'missing');
    if (!headers['permissions-policy']) add('note', 'permissions-policy', 'missing');
  } else if (headers['access-control-allow-origin'] === '*') {
    add('note', 'access-control-allow-origin', 'any origin may read unauthenticated responses');
  }

  for (const name of ['x-powered-by', 'server'] as const) {
    const value = headers[name];
    // A bare product name (cloudflare, railway-edge) says nothing; a version does.
    if (value && (name === 'x-powered-by' || /\d/u.test(value))) {
      add('note', name, `discloses "${value}"`);
    }
  }
  return findings;
}

async function fetchHeaders(
  url: string,
): Promise<{ status: number; headers: Record<string, string> }> {
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20_000) });
  await response.body?.cancel();
  return { status: response.status, headers: Object.fromEntries(response.headers) };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      web: { type: 'string', default: 'https://staging.critterpass.app/' },
      api: { type: 'string', default: 'https://api-staging-de92.up.railway.app/health' },
      json: { type: 'boolean', default: false },
    },
  });
  const results = [];
  for (const [surface, url] of [
    ['web', values.web],
    ['api', values.api],
  ] as const) {
    const { status, headers } = await fetchHeaders(url);
    results.push({ surface, url, status, findings: evaluateHeaders(surface, headers) });
  }
  if (values.json) console.log(JSON.stringify(results, null, 2));
  else {
    for (const result of results) {
      console.log(`${result.surface} ${result.url} → ${result.status}`);
      for (const f of result.findings) console.log(`  ${f.level}: ${f.header}: ${f.message}`);
      if (result.findings.length === 0) console.log('  all checked headers present');
    }
  }
  const failed = results.some((r) => r.findings.some((f) => f.level === 'fail'));
  process.exitCode = failed ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
