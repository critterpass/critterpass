import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { SECURITY_HEADERS, withSecurityHeaders } from './security-headers';

/** The rules of a Cloudflare `_headers` file: path pattern -> header name -> value. */
function parseHeadersFile(text: string): Record<string, Record<string, string>> {
  const rules: Record<string, Record<string, string>> = {};
  let current: Record<string, string> | undefined;
  for (const line of text.split('\n')) {
    if (line.trim() === '' || line.startsWith('#')) continue;
    if (!/^\s/u.test(line)) {
      current = rules[line.trim()] = {};
      continue;
    }
    const colon = line.indexOf(':');
    if (current === undefined || colon === -1) throw new Error(`unreadable line: ${line}`);
    current[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  return rules;
}

describe('security headers', () => {
  it('prerendered pages and files get the same set as Worker responses', () => {
    const file = readFileSync(
      fileURLToPath(new URL('../../public/_headers', import.meta.url)),
      'utf8',
    );
    expect(parseHeadersFile(file)).toEqual({ '/*': SECURITY_HEADERS });
  });

  it('keeps HTTPS for at least 180 days, forbids framing and names no script origin but its own', () => {
    const maxAge = /max-age=(\d+)/u.exec(SECURITY_HEADERS['Strict-Transport-Security'] ?? '');
    expect(Number(maxAge?.[1])).toBeGreaterThanOrEqual(15_552_000);
    const policy = SECURITY_HEADERS['Content-Security-Policy'] ?? '';
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(/script-src ([^;]*)/u.exec(policy)?.[1]).toBe("'self' 'unsafe-inline'");
    expect(policy).not.toContain("'unsafe-eval'");
  });

  it('sets the headers on redirects, whose headers cannot be changed', () => {
    const redirect = Response.redirect('https://critterpass.app/', 301);
    const secured = withSecurityHeaders(redirect);
    expect(secured.status).toBe(301);
    expect(secured.headers.get('location')).toBe('https://critterpass.app/');
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(secured.headers.get(name)).toBe(value);
    }
  });
});
