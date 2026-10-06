/**
 * The tile workflow's steps that need logic (`.github/workflows/routing-tiles.yml`):
 *
 *   plan     --api <api base url> | --boxes <file>  --out plan.json [--only da-nang,bali]
 *            extracts to download, boxes to cut (the api's `GET /v1/routing/boxes`, or a saved list)
 *   changed  --plan plan.json --manifest manifest.json   prints true when the plan's boxes differ
 *            from the published build's (or the file is missing: nothing is published yet)
 *   smoke    --url http://localhost:8002 --plan plan.json   one routed drive inside every box
 *            (an area's box with no route is reported, not failed)
 *   manifest --plan plan.json --osm osm.json --tiles <file.tar.gz> --url <asset url> --out m.json
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';

import { createValhallaClient, type ValhallaPoint } from '@cp/suppliers';

import { fetchBoxes, innerPoints, readBoxesFile } from './boxes';
import { createManifest, manifestSchema } from './manifest';
import { boxesChanged, buildPlan, smokePlan, type TilePlan } from './plan';

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

async function plan(argv: readonly string[]): Promise<void> {
  const only = (flag(argv, 'only') ?? '').split(',').map((slug) => slug.trim());
  const file = flag(argv, 'boxes');
  const boxes =
    file !== undefined && file.length > 0
      ? readBoxesFile(file)
      : await fetchBoxes(required(argv, 'api'));
  const result = buildPlan(boxes, { only });
  writeFileSync(required(argv, 'out'), `${JSON.stringify(result, null, 2)}\n`);
  for (const region of result.regions) {
    console.log(`${region.region}: ${region.boxes.map((box) => box.slug).join(', ')}`);
  }
  if (result.withoutRegion.length > 0) {
    console.log(`left out, no Geofabrik extract known: ${result.withoutRegion.join(', ')}`);
  }
}

function changed(argv: readonly string[]): void {
  const planned = readPlan(required(argv, 'plan'));
  const path = required(argv, 'manifest');
  if (!existsSync(path)) {
    console.log('true');
    return;
  }
  const published = manifestSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  console.log(String(boxesChanged(planned, published.boxes)));
}

/**
 * Drives inside every box: snaps the box's centre and inner points to the road graph and routes
 * from the centre to the first inner point it can reach (an island or a peninsula can leave some
 * inner points on another, unconnected shore). A day-trip area's box is reported, never failed.
 */
async function smoke(argv: readonly string[]): Promise<void> {
  const client = createValhallaClient({
    baseUrl: required(argv, 'url'),
    routeTimeoutMs: 10_000,
    retries: 2,
  });
  await smokePlan(readPlan(required(argv, 'plan')), async (bbox) => {
    const points = innerPoints(bbox).map(([lng, lat]): ValhallaPoint => ({ lat, lng }));
    const [centre, ...others] = (await client.locate(points, 'auto').catch(() => [])).flatMap(
      (location) => (location.snapped === undefined ? [] : [location.snapped]),
    );
    for (const other of others) {
      if (centre === undefined) break;
      const route = await client.route([centre, other], 'auto').catch(() => null);
      if (route !== null && route.meters > 0)
        return `${Math.round(route.seconds / 60)} min, ${route.meters} m`;
    }
    return null;
  });
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
  if (command === 'changed') return changed(argv);
  if (command === 'smoke') return smoke(argv);
  if (command === 'manifest') return manifest(argv);
  throw new Error(
    `unknown command ${command ?? '(none)'}; expected plan, changed, smoke or manifest`,
  );
}

await main();
