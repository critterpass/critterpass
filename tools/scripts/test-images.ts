/**
 * The container images the database suites pull from a registry, read from where the suites name
 * them: the base of the test Postgres image (infra/docker/postgres/Dockerfile), every `*_IMAGE`
 * constant and `GenericContainer('…')` literal in tracked test code, and Testcontainers' own Ryuk
 * image. CI pulls them before the suites start, a few tries each, so a registry that answers 500
 * for a moment costs a retry instead of a suite; the suites then find them on the runner.
 *
 *   tsx tools/scripts/test-images.ts           # one image per line
 *   tsx tools/scripts/test-images.ts --pull    # pull them all in parallel, three tries of 3 min each
 */
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const TEST_CODE = /(^|\/)(test|__tests__|test-support)\/.*\.tsx?$/;

/** Images a file names: `*_IMAGE = '…'` constants and `GenericContainer('…')` literals. */
export function imagesIn(source: string): string[] {
  const patterns = [/_IMAGE\s*=\s*['"]([^'"]+)['"]/g, /GenericContainer\(\s*['"]([^'"]+)['"]/g];
  return patterns.flatMap((pattern) =>
    [...source.matchAll(pattern)].map((match) => match[1] ?? ''),
  );
}

/** The images a Dockerfile builds from. */
export function baseImages(dockerfile: string): string[] {
  return [...dockerfile.matchAll(/^FROM\s+(?:--\S+\s+)*(\S+)/gm)].map((match) => match[1] ?? '');
}

/** A registry image, as opposed to one the suites build and tag themselves (`critterpass-…`). */
export function isPulled(image: string): boolean {
  return /^[a-z0-9]/.test(image) && image.includes(':') && !image.startsWith('critterpass-');
}

/** Testcontainers' Ryuk image, from the copy @cp/db's suites load. */
function ryukImage(): string[] {
  try {
    const require = createRequire(path.join(REPO_ROOT, 'packages/db/package.json'));
    const root = path.dirname(require.resolve('testcontainers/package.json'));
    const files = readdirSync(path.join(root, 'build'), { recursive: true, encoding: 'utf8' });
    for (const file of files.filter((name) => name.endsWith('.js'))) {
      const found = /testcontainers\/ryuk:[\w.-]+/.exec(
        readFileSync(path.join(root, 'build', file), 'utf8'),
      );
      if (found) return [found[0]];
    }
  } catch {
    // Not installed here: Testcontainers pulls Ryuk itself, as before.
  }
  return [];
}

export function testImages(root = REPO_ROOT): string[] {
  const tracked = execFileSync('git', ['ls-files', 'apps', 'packages', 'services', 'tools'], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\n')
    .filter((file) => TEST_CODE.test(file) && !file.includes('/fixtures/'));
  const dockerfile = path.join(root, 'infra/docker/postgres/Dockerfile');
  const named = [
    ...(existsSync(dockerfile) ? baseImages(readFileSync(dockerfile, 'utf8')) : []),
    ...tracked.flatMap((file) => imagesIn(readFileSync(path.join(root, file), 'utf8'))),
    ...ryukImage(),
  ];
  return [...new Set(named.filter(isPulled))].sort();
}

const run = promisify(execFile);

async function pull(image: string): Promise<boolean> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      // A registry that stalls rather than fails is cut off after three minutes and tried again.
      await run('docker', ['pull', '--quiet', image], { timeout: 180_000 });
      console.log(`pulled ${image}`);
      return true;
    } catch (error) {
      const why = error instanceof Error ? error.message.split('\n')[0] : String(error);
      console.log(`::warning::Pulling ${image} failed (try ${String(attempt)} of 3): ${why}`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 10_000));
    }
  }
  return false;
}

async function main(): Promise<void> {
  const images = testImages();
  if (!process.argv.includes('--pull')) {
    console.log(images.join('\n'));
    return;
  }
  // An image that still will not come is left to the suite that needs it, which tries once more.
  await Promise.all(images.map((image) => pull(image)));
}

const isMainModule = import.meta.url === `file://${process.argv[1] ?? ''}`;
if (isMainModule) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
