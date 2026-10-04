/**
 * The tile workflow's steps that need logic (`.github/workflows/routing-tiles.yml`):
 *
 *   plan     --out plan.json [--only da-nang,bali]   extracts to download, boxes to cut
 *   smoke    --url http://localhost:8002 --plan plan.json   one routed drive inside every box
 *   manifest --plan plan.json --osm osm.json --tiles <file.tar.gz> --url <asset url> --out m.json
 */
import { createHash } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';

import { createValhallaClient, type ValhallaPoint } from '@cp/suppliers';

import { innerPoints, readBoxes } from './boxes';
import { createManifest } from './manifest';
import { buildPlan, type TilePlan } from './plan';

function flag(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? undefined : argv[index + 1];
}

function required(argv: readonly string[], name: string): string {
  const value = flag(argv, name);
  if (value === undefined || value.length === 0) throw new Error(`--${name} is required`);
  return value;
}

const readPlan = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as TilePlan;

function plan(argv: readonly string[]): void {
  const only = (flag(argv, 'only') ?? '').split(',').map((slug) => slug.trim());
  const result = buildPlan(readBoxes(), { only });
  writeFileSync(required(argv, 'out'), `${JSON.stringify(result, null, 2)}\n`);
  for (const region of result.regions) {
    console.log(`${region.region}: ${region.boxes.map((box) => box.slug).join(', ')}`);
  }
}

/**
 * Drives inside every box: snaps the box's centre and inner points to the road graph and routes
 * from the centre to the first inner point it can reach (an island or a peninsula can leave some
 * inner points on another, unconnected shore).
 */
async function smoke(argv: readonly string[]): Promise<void> {
  const client = createValhallaClient({
    baseUrl: required(argv, 'url'),
    routeTimeoutMs: 10_000,
    retries: 2,
  });
  const failures: string[] = [];
  for (const box of readPlan(required(argv, 'plan')).regions.flatMap((region) => region.boxes)) {
    const points = innerPoints(box.bbox).map(([lng, lat]): ValhallaPoint => ({ lat, lng }));
    const [centre, ...others] = (await client.locate(points, 'auto').catch(() => [])).flatMap(
      (location) => (location.snapped === undefined ? [] : [location.snapped]),
    );
    let answer: string | null = null;
    for (const other of others) {
      if (centre === undefined) break;
      const route = await client.route([centre, other], 'auto').catch(() => null);
      if (route !== null && route.meters > 0) {
        answer = `${Math.round(route.seconds / 60)} min, ${route.meters} m`;
        break;
      }
    }
    if (answer === null) failures.push(box.slug);
    console.log(`${box.slug}: ${answer ?? 'no route between inner points'}`);
  }
  if (failures.length > 0) throw new Error(`no route in ${failures.join(', ')}`);
}

function manifest(argv: readonly string[]): void {
  const tiles = required(argv, 'tiles');
  const build = required(argv, 'build');
  const boxes = readPlan(required(argv, 'plan')).regions.flatMap((region) =>
    region.boxes.map((box) => ({
      slug: box.slug,
      bbox: [...box.bbox] as [number, number, number, number],
    })),
  );
  const result = createManifest({
    build,
    createdAt: new Date().toISOString(),
    osm: JSON.parse(readFileSync(required(argv, 'osm'), 'utf8')) as Record<string, string>,
    boxes,
    tiles: {
      url: required(argv, 'url'),
      encoding: 'gzip',
      bytes: statSync(tiles).size,
      sha256: createHash('sha256').update(readFileSync(tiles)).digest('hex'),
    },
  });
  writeFileSync(required(argv, 'out'), `${JSON.stringify(result, null, 2)}\n`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2).filter((arg) => arg !== '--');
  const [command] = argv;
  if (command === 'plan') return plan(argv);
  if (command === 'smoke') return smoke(argv);
  if (command === 'manifest') return manifest(argv);
  throw new Error(`unknown command ${command ?? '(none)'}; expected plan, smoke or manifest`);
}

await main();
