/**
 * Builds one PMTiles archive, either:
 *
 * - `--destination <slug>` (region mode): a full-detail region pack for one of the 6 guide
 *   destinations (`destinations.ts`) or a guest-place city-bbox pack (pass `--geofabrik-region` +
 *   `--bounds` explicitly for a place not in that registry) — downloads the real Geofabrik regional
 *   `.osm.pbf` and runs it through planetiler's bundled OpenMapTiles profile, exactly the technique
 *   `tools/spikes/tiles/build.ts` proved out (Da Nang, real data, real planetiler.jar). Needs a
 *   Java 21+ binary (`PLANETILER_JAVA` override, same as the spike — this Mac's default `java` is
 *   JBR 17).
 * - `--world` (world mode): the global low-zoom basemap. A real self-built planet extract is
 *   infeasible on this machine (planet.osm.pbf is ~70+ GB; this box has ~14 GB free) — instead this
 *   uses `pmtiles extract` against Protomaps' public daily planet build
 *   (https://build.protomaps.com), which supports remote *zoom-limited* extraction over HTTP range
 *   requests: verified in this pass to transfer only ~555 MB for the entire world at z0-8 out of a
 *   138 GB source file, in ~12 s. Needs the `pmtiles` CLI on `PATH` (`PMTILES_BIN` override) — the
 *   Go binary (`brew install pmtiles` or `go install
 *   github.com/protomaps/go-pmtiles/cmd/pmtiles@latest`), not an npm package.
 *
 * Default `--max-zoom` is 7, not the phase doc's z0-8: `wrangler r2 object put` hard-caps a single
 * PUT at 300 MiB regardless of CLI version (verified against 4.56.0 and 4.141.0 — the same error
 * both times) and has no multipart path; R2's real limit is much higher, wrangler's CLI is the
 * bottleneck. z0-8 measured 555 MB (over the cap); z0-7 measured 188 MB (comfortably under it,
 * verified via a real `pmtiles extract --dry-run`). Pass `--max-zoom=8` explicitly once a
 * multipart-capable upload path exists (R2's S3-compatible API, e.g. `@aws-sdk/client-s3`, not yet
 * a dependency anywhere in this repo) — `build-style.ts`'s world source doesn't hard-code a zoom
 * cutoff, so this is a pure re-run, not a schema change.
 *
 * World tiles use Protomaps' own "Protomaps Basemap" vector schema (`boundaries, buildings, earth,
 * landcover, landuse, places, pois, roads, water` — read from a real build's `pmtiles show
 * --metadata`, not guessed), distinct from planetiler's OpenMapTiles schema that region packs use;
 * `build-style.ts` styles both schemas under separate `world`/`region` sources.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { resolveGuideDestination } from './destinations';

const PLANETILER_JAR_URL =
  'https://github.com/onthegomap/planetiler/releases/latest/download/planetiler.jar';
const PROTOMAPS_BUILD_BASE_URL = 'https://build.protomaps.com';
/** How many days back to probe for the latest published daily build before giving up. */
const PROTOMAPS_BUILD_LOOKBACK_DAYS = 10;

interface RegionArgs {
  readonly mode: 'region';
  readonly destination: string;
  readonly geofabrikRegion?: string;
  readonly bounds?: string;
  readonly out: string;
  readonly minZoom: number;
  readonly maxZoom: number;
  readonly maxHeapMb: number;
}

interface WorldArgs {
  readonly mode: 'world';
  readonly out: string;
  readonly maxZoom: number;
}

function parseArgs(argv: readonly string[]): RegionArgs | WorldArgs {
  const get = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  if (argv.includes('--world')) {
    return {
      mode: 'world',
      out: get('--out') ?? path.join(process.cwd(), '.output/world.pmtiles'),
      maxZoom: Number(get('--max-zoom') ?? '7'),
    };
  }
  const destination = get('--destination');
  if (!destination) {
    throw new Error(
      'tiles build-pmtiles: --destination <slug> or --world is required (e.g. --destination kyoto)',
    );
  }
  const geofabrikRegion = get('--geofabrik-region');
  const bounds = get('--bounds');
  return {
    mode: 'region',
    destination,
    ...(geofabrikRegion !== undefined ? { geofabrikRegion } : {}),
    ...(bounds !== undefined ? { bounds } : {}),
    out: get('--out') ?? path.join(process.cwd(), `.output/${destination}.pmtiles`),
    minZoom: Number(get('--min-zoom') ?? '0'),
    maxZoom: Number(get('--max-zoom') ?? '14'),
    maxHeapMb: Number(get('--max-heap-mb') ?? '2048'),
  };
}

function resolveJavaBinary(): string {
  const candidate = process.env['PLANETILER_JAVA'] ?? 'java';
  const versionCheck = spawnSync(candidate, ['-version'], { encoding: 'utf8' });
  if (versionCheck.status !== 0) {
    throw new Error(
      `tiles build-pmtiles: could not run "${candidate} -version" (${versionCheck.error?.message ?? 'unknown error'})`,
    );
  }
  const match = /version "(\d+)/.exec(versionCheck.stderr);
  const major = match?.[1] !== undefined ? Number(match[1]) : 0;
  if (major < 21) {
    throw new Error(
      `tiles build-pmtiles: planetiler needs Java 21+, found major version ${major || 'unknown'}. ` +
        'Set PLANETILER_JAVA to a Java 21+ binary.',
    );
  }
  return candidate;
}

function resolvePmtilesBinary(): string {
  return process.env['PMTILES_BIN'] ?? 'pmtiles';
}

function downloadFile(url: string, destPath: string): void {
  const result = spawnSync('curl', ['-sL', '-o', destPath, url], { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(
      `tiles build-pmtiles: download failed for ${url} (exit ${String(result.status)})`,
    );
  }
}

/** Probes backwards from today for the most recent published Protomaps daily build (a HEAD-only
 *  range request, not a download) — the exact date of "latest" shifts daily, so this is resolved
 *  for real rather than hard-coded to whichever date happened to exist when this was written. */
function resolveLatestProtomapsBuildUrl(): string {
  const today = new Date();
  for (let daysAgo = 0; daysAgo <= PROTOMAPS_BUILD_LOOKBACK_DAYS; daysAgo += 1) {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() - daysAgo);
    const stamp = date.toISOString().slice(0, 10).replaceAll('-', '');
    const url = `${PROTOMAPS_BUILD_BASE_URL}/${stamp}.pmtiles`;
    const probe = spawnSync('curl', ['-sI', '--max-time', '15', '-r', '0-1', url], {
      encoding: 'utf8',
    });
    if (/^HTTP\/\d(\.\d)? (200|206)/m.test(probe.stdout)) return url;
  }
  throw new Error(
    `tiles build-pmtiles: no Protomaps daily build found in the last ${String(PROTOMAPS_BUILD_LOOKBACK_DAYS)} days at ${PROTOMAPS_BUILD_BASE_URL}`,
  );
}

function buildWorld(args: WorldArgs): void {
  const pmtilesBin = resolvePmtilesBinary();
  const sourceUrl = resolveLatestProtomapsBuildUrl();
  mkdirSync(path.dirname(args.out), { recursive: true });
  if (existsSync(args.out)) rmSync(args.out);

  console.log(JSON.stringify({ msg: 'tiles build-pmtiles: extracting world basemap', sourceUrl }));
  const startedAt = Date.now();
  const run = spawnSync(
    pmtilesBin,
    ['extract', sourceUrl, args.out, '--minzoom=0', `--maxzoom=${String(args.maxZoom)}`],
    { stdio: 'inherit' },
  );
  if (run.status !== 0) {
    throw new Error(`tiles build-pmtiles: pmtiles extract exited with code ${String(run.status)}`);
  }
  const { size } = statSync(args.out);
  console.log(
    JSON.stringify({
      msg: 'tiles build-pmtiles: world done',
      out: args.out,
      sizeBytes: size,
      durationSeconds: (Date.now() - startedAt) / 1000,
    }),
  );
}

function buildRegion(args: RegionArgs): void {
  const registryEntry =
    args.geofabrikRegion !== undefined && args.bounds !== undefined
      ? { geofabrikRegion: args.geofabrikRegion, bounds: args.bounds }
      : resolveGuideDestination(args.destination);
  const javaBin = resolveJavaBinary();

  const workDir = mkdtempSync(path.join(tmpdir(), 'cp-tiles-build-'));
  const jarPath = path.join(workDir, 'planetiler.jar');
  const pbfPath = path.join(workDir, `${args.destination}.osm.pbf`);
  const pmtilesPath = path.join(workDir, `${args.destination}.pmtiles`);

  try {
    console.log(JSON.stringify({ msg: 'tiles build-pmtiles: downloading planetiler.jar' }));
    downloadFile(PLANETILER_JAR_URL, jarPath);

    const pbfUrl = `https://download.geofabrik.de/${registryEntry.geofabrikRegion}-latest.osm.pbf`;
    console.log(
      JSON.stringify({ msg: 'tiles build-pmtiles: downloading OSM extract', url: pbfUrl }),
    );
    downloadFile(pbfUrl, pbfPath);

    const startedAt = Date.now();
    const planetilerArgs = [
      `-Xmx${String(args.maxHeapMb)}m`,
      '-jar',
      jarPath,
      '--download',
      `--osm_path=${pbfPath}`,
      `--output=${pmtilesPath}`,
      `--bounds=${registryEntry.bounds}`,
      `--minzoom=${String(args.minZoom)}`,
      `--maxzoom=${String(args.maxZoom)}`,
      '--force',
    ];
    console.log(
      JSON.stringify({ msg: 'tiles build-pmtiles: running planetiler', args: planetilerArgs }),
    );
    const run = spawnSync(javaBin, planetilerArgs, { stdio: 'inherit', cwd: workDir });
    if (run.status !== 0) {
      throw new Error(`tiles build-pmtiles: planetiler exited with code ${String(run.status)}`);
    }
    const durationSeconds = (Date.now() - startedAt) / 1000;

    mkdirSync(path.dirname(args.out), { recursive: true });
    if (existsSync(args.out)) rmSync(args.out);
    renameSync(pmtilesPath, args.out);

    const { size } = statSync(args.out);
    console.log(
      JSON.stringify({
        msg: 'tiles build-pmtiles: region done',
        destination: args.destination,
        out: args.out,
        sizeBytes: size,
        durationSeconds,
      }),
    );
  } finally {
    // Always clean up the source PBF, the jar and planetiler's own temp/auxiliary data — never
    // left on disk after a run, per the phase's disk-safety rule.
    rmSync(workDir, { recursive: true, force: true });
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode === 'world') buildWorld(args);
  else buildRegion(args);
}

if (import.meta.main) main();
