import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { consumerDeps, packageDeps } from '../lint/boundaries.js';

const repoRoot = path.resolve(import.meta.dirname, '../..');

interface Manifest {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function workspaceManifests(): { dir: string; manifest: Manifest }[] {
  return ['apps', 'services', 'packages', 'tools'].flatMap((group) => {
    const groupDir = path.join(repoRoot, group);
    if (!existsSync(groupDir)) return [];
    return readdirSync(groupDir)
      .map((name) => path.join(group, name))
      .filter((dir) => existsSync(path.join(repoRoot, dir, 'package.json')))
      .map((dir) => ({
        dir,
        manifest: JSON.parse(
          readFileSync(path.join(repoRoot, dir, 'package.json'), 'utf8'),
        ) as Manifest,
      }));
  });
}

/** Internal packages a workspace member may depend on, per docs/system-architecture.md §3. */
function allowedFor(dir: string): readonly string[] {
  const [group, name = ''] = dir.split('/');
  if (group === 'packages') return packageDeps[name as keyof typeof packageDeps] ?? [];
  if (dir === 'apps/mobile') return consumerDeps.mobile;
  if (dir === 'apps/web') return consumerDeps.web;
  if (dir === 'apps/admin') return consumerDeps.admin;
  if (dir === 'services/media-worker') return consumerDeps['media-worker'];
  if (group === 'services') return consumerDeps.service;
  if (group === 'tools') return consumerDeps.tools;
  return [];
}

describe('workspace dependency graph', () => {
  const manifests = workspaceManifests();

  it('names every workspace package @cp/<dir>', () => {
    for (const { dir, manifest } of manifests) {
      expect(manifest.name, dir).toBe(`@cp/${path.basename(dir)}`);
    }
  });

  it.each(manifests.map(({ dir, manifest }) => [dir, manifest] as const))(
    '%s depends only on internal packages it may import',
    (dir, manifest) => {
      const internal = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })
        .filter((dep) => dep.startsWith('@cp/'))
        .map((dep) => dep.slice('@cp/'.length));
      const disallowed = internal.filter((dep) => !allowedFor(dir).includes(dep));
      expect(disallowed).toEqual([]);
    },
  );
});
