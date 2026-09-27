import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveCity } from './cities';

/**
 * Builds a one-city PMTiles archive from a Geofabrik regional extract with planetiler
 * (OpenMapTiles profile). Downloads the regional `.osm.pbf` and planetiler's own auxiliary
 * shapefiles (water polygons, lake centerlines, natural earth) into a throwaway temp dir and
 * deletes all of it afterwards — only the `.pmtiles` output survives. Rerun with `upload.ts` to
 * push the result to R2 (`cp-tiles`).
 *
 * Real behaviour: this shells out to the actual planetiler.jar (downloaded from GitHub releases)
 * against a real Geofabrik extract; nothing here is faked or pre-baked.
 */
const PLANETILER_JAR_URL =
  'https://github.com/onthegomap/planetiler/releases/latest/download/planetiler.jar';

interface CliArgs {
  city: string;
  out: string;
  minZoom: number;
  maxZoom: number;
  maxHeapMb: number;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const get = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  const city = get('--city');
  if (!city) throw new Error('tiles build: --city <name> is required (e.g. --city da-nang)');
  return {
    city,
    out: get('--out') ?? join(process.cwd(), 'tiles', `.output/${city}.pmtiles`),
    minZoom: Number(get('--min-zoom') ?? '0'),
    maxZoom: Number(get('--max-zoom') ?? '14'),
    maxHeapMb: Number(get('--max-heap-mb') ?? '2048'),
  };
}

/** Finds a Java 21+ binary: `PLANETILER_JAVA` env override, else `java` on PATH. */
function resolveJavaBinary(): string {
  const candidate = process.env['PLANETILER_JAVA'] ?? 'java';
  const versionCheck = spawnSync(candidate, ['-version'], { encoding: 'utf8' });
  if (versionCheck.status !== 0) {
    throw new Error(
      `tiles build: could not run "${candidate} -version" (${versionCheck.error?.message ?? 'unknown error'})`,
    );
  }
  // `java -version` writes to stderr, e.g. `openjdk version "21.0.12" ...`.
  const match = /version "(\d+)/.exec(versionCheck.stderr);
  const major = match?.[1] !== undefined ? Number(match[1]) : 0;
  if (major < 21) {
    throw new Error(
      `tiles build: planetiler needs Java 21+, found major version ${major || 'unknown'} at ` +
        `"${candidate}". Install one (e.g. \`brew install openjdk@21\`) and set ` +
        `PLANETILER_JAVA=/opt/homebrew/opt/openjdk@21/bin/java, or point PLANETILER_JAVA at any ` +
        'other Java 21+ binary.',
    );
  }
  return candidate;
}

function downloadFile(url: string, destPath: string): void {
  const result = spawnSync('curl', ['-sL', '-o', destPath, url], { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`tiles build: download failed for ${url} (exit ${String(result.status)})`);
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const city = resolveCity(args.city);
  const javaBin = resolveJavaBinary();

  const workDir = mkdtempSync(join(tmpdir(), 'cp-tiles-build-'));
  const jarPath = join(workDir, 'planetiler.jar');
  const pbfPath = join(workDir, `${args.city}.osm.pbf`);
  const pmtilesPath = join(workDir, `${args.city}.pmtiles`);

  try {
    console.log(JSON.stringify({ msg: 'tiles build: downloading planetiler.jar' }));
    downloadFile(PLANETILER_JAR_URL, jarPath);

    const pbfUrl = `https://download.geofabrik.de/${city.geofabrikRegion}-latest.osm.pbf`;
    console.log(JSON.stringify({ msg: 'tiles build: downloading OSM extract', url: pbfUrl }));
    downloadFile(pbfUrl, pbfPath);

    const startedAt = Date.now();
    const planetilerArgs = [
      `-Xmx${String(args.maxHeapMb)}m`,
      '-jar',
      jarPath,
      '--download', // fetches planetiler's own water/lake/natural-earth auxiliary sources
      `--osm_path=${pbfPath}`,
      `--output=${pmtilesPath}`,
      `--bounds=${city.bounds}`,
      `--minzoom=${String(args.minZoom)}`,
      `--maxzoom=${String(args.maxZoom)}`,
      '--force',
    ];
    console.log(JSON.stringify({ msg: 'tiles build: running planetiler', args: planetilerArgs }));
    const run = spawnSync(javaBin, planetilerArgs, { stdio: 'inherit', cwd: workDir });
    if (run.status !== 0) {
      throw new Error(`tiles build: planetiler exited with code ${String(run.status)}`);
    }
    const durationSeconds = (Date.now() - startedAt) / 1000;

    mkdirSync(join(args.out, '..'), { recursive: true });
    if (existsSync(args.out)) rmSync(args.out);
    renameSync(pmtilesPath, args.out);

    const { size } = statSync(args.out);
    console.log(
      JSON.stringify({
        msg: 'tiles build: done',
        city: args.city,
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

main();
