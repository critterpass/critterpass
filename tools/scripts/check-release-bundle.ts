import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Guards docs/system-architecture.md's "Dev routes" contract: a production export of
 * apps/mobile must never contain the apps/mobile/src/app/(dev)/** route group or its marker.
 */
export const DEV_ROUTE_MARKER = '__CP_DEV_ROUTE__';
export const DEV_ROUTE_SEGMENT = '(dev)';

const MOBILE_DIR = path.resolve(import.meta.dirname, '../../apps/mobile');
const PLATFORMS = ['ios', 'android'] as const;
type Platform = (typeof PLATFORMS)[number];

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
  });
}

/** Pure check over an already-exported bundle directory; safe to unit test without a real export. */
export function findViolations(outputDir: string, platform: string): string[] {
  return listFiles(outputDir).flatMap((file) => {
    const relative = path.relative(outputDir, file);
    if (relative.includes(DEV_ROUTE_SEGMENT)) {
      return [`${platform}: exported path contains "${DEV_ROUTE_SEGMENT}": ${relative}`];
    }
    if (readFileSync(file).includes(DEV_ROUTE_MARKER)) {
      return [`${platform}: bundle contains marker "${DEV_ROUTE_MARKER}": ${relative}`];
    }
    return [];
  });
}

function exportBundle(platform: Platform, outputDir: string): void {
  const result = spawnSync(
    'pnpm',
    ['exec', 'expo', 'export', '--platform', platform, '--output-dir', outputDir, '--clear'],
    {
      cwd: MOBILE_DIR,
      env: { ...process.env, APP_VARIANT: 'production' },
      stdio: 'inherit',
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`expo export --platform ${platform} exited with code ${String(result.status)}`);
  }
}

function main(): void {
  const workDir = mkdtempSync(path.join(tmpdir(), 'cp-release-bundle-'));
  try {
    const violations = PLATFORMS.flatMap((platform) => {
      const outputDir = path.join(workDir, platform);
      exportBundle(platform, outputDir);
      return findViolations(outputDir, platform);
    });

    if (violations.length > 0) {
      console.error('Release bundle check failed:');
      for (const violation of violations) console.error(`  - ${violation}`);
      process.exitCode = 1;
      return;
    }

    console.log('Release bundle check passed: no dev-only routes in the production export.');
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

const isMainModule = import.meta.url === `file://${process.argv[1] ?? ''}`;
if (isMainModule) {
  main();
}
