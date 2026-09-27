/**
 * Request paths that carry a link code or token, rewritten for logs: the secret segment becomes a
 * short SHA-256 prefix, enough to correlate requests without ever logging the value itself.
 */
import { createHash } from 'node:crypto';

const SECRET_PATH_PATTERNS: readonly RegExp[] = [
  /^(\/v1\/links\/)([^/]+)(\/preview)$/,
  /^(\/v1\/codes\/)([^/]+)()$/,
];

export function hashForLog(value: string): string {
  return `h:${createHash('sha256').update(value).digest('hex').slice(0, 12)}`;
}

export function redactLinkPath(path: string): string {
  for (const pattern of SECRET_PATH_PATTERNS) {
    const match = pattern.exec(path);
    if (match !== null) return `${match[1] ?? ''}${hashForLog(match[2] ?? '')}${match[3] ?? ''}`;
  }
  return path;
}
