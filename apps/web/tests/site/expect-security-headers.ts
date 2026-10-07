import { expect } from '@playwright/test';

/** The security headers every response of the site carries, however it was produced. */
export function expectSecurityHeaders(headers: Record<string, string>): void {
  const maxAge = /max-age=(\d+)/u.exec(headers['strict-transport-security'] ?? '');
  expect(Number(maxAge?.[1])).toBeGreaterThanOrEqual(15_552_000);
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['permissions-policy']).toContain('geolocation=()');
  const policy = headers['content-security-policy'] ?? '';
  expect(policy).toContain("default-src 'self'");
  expect(policy).toContain("frame-ancestors 'none'");
  expect(policy).not.toContain("'unsafe-eval'");
}
