/**
 * Fails the build when the console bundle carries anything shaped like a secret: the SPA is public
 * behind Access and holds no credentials; the api holds them all. Runs after `vite build`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export const SECRET_PATTERNS: readonly { name: string; pattern: RegExp }[] = [
  { name: 'secret key (sk_)', pattern: /\bsk_(?:live|test)?_?[A-Za-z0-9]{16,}/ },
  { name: 'PEM block', pattern: /-----BEGIN [A-Z ]+-----/ },
  { name: 'AWS access key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Google API key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: 'Slack token', pattern: /\bxox[abpr]-[A-Za-z0-9-]{10,}/ },
];

export function findSecrets(text: string): string[] {
  return SECRET_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ name }) => name);
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

if (import.meta.url === `file://${process.argv[1] ?? ''}`) {
  const dist = path.resolve(import.meta.dirname, '../dist');
  const hits = files(dist).flatMap((file) =>
    findSecrets(readFileSync(file, 'utf8')).map((name) => `${path.relative(dist, file)}: ${name}`),
  );
  if (hits.length > 0) {
    console.error(`The console bundle looks like it holds secrets:\n${hits.join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log('console bundle: no secret-shaped strings');
  }
}
