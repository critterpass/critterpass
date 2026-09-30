/**
 * The release gate's report: one row per happy-path flow and platform, with its video.
 *
 *   tsx tools/scripts/ci-device/release-gate.ts <shards dir> --media <dir> --raw-url <url> \
 *     --blob-url <url> [--out report.md] [--run-url <url>] [--commit <sha>]
 *
 * Reads every downloaded shard artifact (`device-<platform>-shard-<n>/`): each flow's JUnit report
 * (pass or fail, duration, the failing step), its recorded segments (`videos/<flow>/seg-*.mp4`,
 * from run-shard.ts --video) and, when it failed, the screen at that moment (`failures/<flow>.png`).
 * Into --media/<platform>/ it writes `<flow>.mp4` (the segments joined, 360 px wide), `<flow>.gif`
 * (a sped-up preview, a minute at most) and `<flow>-failure.png`, all with ffmpeg. The markdown
 * table embeds the GIFs and failure screens from --raw-url and links the MP4s under --blob-url:
 * both are where the media folder is published (the `screenshots` branch, see
 * publish-screenshots.sh).
 */
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { readShards } from './run-summary';
import { segmentFiles } from './screen-video';

/** The shard's first flow, which only proves the app runs this run's JS. */
const JS_COMMIT_FLOW = 'tools__scripts__ci-device__js-commit';

export interface GateFlow {
  readonly platform: string;
  readonly slug: string;
  /** The flow's name in the report: `e2e__happy__money` → `money`. */
  readonly name: string;
  readonly passed: boolean;
  readonly seconds: number;
  readonly failure?: string;
  readonly shardDir: string;
}

/** Pass or fail, duration and the failure message of one Maestro JUnit report. */
export function parseJunit(xml: string): { passed: boolean; seconds: number; failure?: string } {
  const time = /<testcase\b[^>]*\btime="([\d.]+)"/.exec(xml)?.[1];
  const failure = /<(failure|error)\b[^>]*?(?:\/>|>([\s\S]*?)<\/\1>)/.exec(xml);
  const seconds = Math.round(Number(time ?? 0));
  if (!failure) return { passed: true, seconds };
  const message = unescapeXml(failure[2] ?? '').trim() || 'failed';
  return { passed: false, seconds, failure: message };
}

function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function flowName(slug: string): string {
  return slug.replace(/^e2e__happy__/, '').replace(/__/g, '/');
}

/**
 * The step Maestro failed on, from its log (`… runFlow…: Input text landing at six FAILED`): a
 * failure message alone ("Unknown error", a driver timeout) does not say which step it was. The
 * step itself fails first, then the subflows around it.
 */
export function failedStep(log: string): string | undefined {
  const steps = [...log.matchAll(/TestSuiteInteractor\.runFlow\S*: (.+) FAILED$/gm)];
  return steps[0]?.[1]?.trim();
}

/** Every flow of every shard; the JS commit check is listed only when it failed. */
export function readGateFlows(root: string): GateFlow[] {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => /^device-(ios|android)-shard-\d+$/.test(name))
    .sort()
    .flatMap((shard) => {
      const shardDir = path.join(root, shard);
      const platform = shard.split('-')[1] ?? '';
      const junit = path.join(shardDir, 'junit');
      if (!existsSync(junit)) return [];
      return readdirSync(junit)
        .filter((file) => file.endsWith('.xml'))
        .map((file) => {
          const slug = file.replace(/\.xml$/, '');
          const result = parseJunit(readFileSync(path.join(junit, file), 'utf8'));
          const log = path.join(shardDir, 'maestro', slug, 'maestro.log');
          const step =
            result.failure && existsSync(log) ? failedStep(readFileSync(log, 'utf8')) : undefined;
          // Assertions name their element already; other failures (a driver timeout) need the step.
          const bare =
            result.failure === undefined ||
            /^(Assertion is false|Element not found)/.test(result.failure);
          const failure = step && !bare ? `${step}: ${result.failure ?? ''}` : result.failure;
          return {
            platform,
            slug,
            name: flowName(slug),
            shardDir,
            passed: result.passed,
            seconds: result.seconds,
            ...(failure === undefined ? {} : { failure }),
          };
        })
        .filter((flow) => flow.slug !== JS_COMMIT_FLOW || !flow.passed);
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.platform.localeCompare(b.platform));
}

/** The GIF preview's speed-up: at least 4×, more for long flows so a preview stays near a minute. */
export function previewSpeed(seconds: number): number {
  return Math.max(4, Math.ceil(seconds / 60));
}

function ffmpeg(args: string[]): boolean {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    stdio: 'inherit',
  });
  return result.status === 0;
}

export interface GateMedia {
  readonly mp4?: string;
  readonly gif?: string;
  readonly failureShot?: string;
}

/** Joins a flow's segments into one small MP4 and a GIF preview; copies its failure screen. */
export function buildMedia(flow: GateFlow, mediaDir: string): GateMedia {
  const dir = path.join(mediaDir, flow.platform);
  const file = flow.name.replace(/\//g, '__');
  mkdirSync(dir, { recursive: true });
  const media: { mp4?: string; gif?: string; failureShot?: string } = {};
  const shot = path.join(flow.shardDir, 'failures', `${flow.slug}.png`);
  if (!flow.passed && existsSync(shot)) {
    media.failureShot = `${flow.platform}/${file}-failure.png`;
    copyFileSync(shot, path.join(mediaDir, media.failureShot));
  }
  const segments = segmentFiles(path.join(flow.shardDir, 'videos', flow.slug));
  if (segments.length === 0) return media;
  const list = path.join(dir, `${file}.segments.txt`);
  writeFileSync(list, segments.map((file) => `file '${file}'\n`).join(''));
  const mp4 = `${flow.platform}/${file}.mp4`;
  const encoded = ffmpeg([
    ...['-f', 'concat', '-safe', '0', '-i', list],
    ...['-vf', 'scale=360:-2,fps=15', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30'],
    ...['-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', path.join(mediaDir, mp4)],
  ]);
  if (!encoded) return media;
  media.mp4 = mp4;
  const gif = `${flow.platform}/${file}.gif`;
  const speed = previewSpeed(flow.seconds);
  const filter = `setpts=PTS/${String(speed)},fps=4,scale=240:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse=dither=bayer`;
  if (
    ffmpeg(['-i', path.join(mediaDir, mp4), '-vf', filter, '-loop', '0', path.join(mediaDir, gif)])
  )
    media.gif = gif;
  return media;
}

function duration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${String(minutes)}m ${String(seconds % 60)}s` : `${String(seconds)}s`;
}

/** Markdown-safe text for a table cell. */
function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
}

export interface GateReportOptions {
  readonly rawUrl: string;
  readonly blobUrl: string;
  readonly runUrl?: string;
  readonly commit?: string;
  /** The app's `[ui-qa]` reports and the screen-check findings of the run's shards. */
  readonly uiReports?: readonly string[];
}

export function formatGateReport(
  rows: readonly { flow: GateFlow; media: GateMedia }[],
  options: GateReportOptions,
): string {
  const failed = rows.filter((row) => !row.flow.passed);
  const verdict =
    rows.length === 0
      ? '**No flow ran.**'
      : failed.length === 0
        ? `**Pass**: all ${String(rows.length)} flow runs passed.`
        : `**Fail**: ${String(failed.length)} of ${String(rows.length)} flow runs failed.`;
  const from = [
    options.commit ? `commit \`${options.commit}\`` : '',
    options.runUrl ? `[this run](${options.runUrl})` : '',
  ].filter(Boolean);
  const out = [
    '## Release gate',
    '',
    `${verdict}${from.length ? ` From ${from.join(', ')}.` : ''}`,
    '',
  ];
  out.push('| flow | platform | result | time | preview | video | failing step |');
  out.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const { flow, media } of rows) {
    const preview = media.gif ? `<img src="${options.rawUrl}/${media.gif}" width="120">` : '';
    const video = media.mp4 ? `[MP4](${options.blobUrl}/${media.mp4})` : 'none';
    const step = flow.failure ? `\`${cell(flow.failure).slice(0, 300)}\`` : '';
    const shot = media.failureShot
      ? `<br><img src="${options.rawUrl}/${media.failureShot}" width="120">`
      : '';
    out.push(
      `| \`${flow.name}\` | ${flow.platform} | ${flow.passed ? 'pass' : '**FAIL**'} | ${duration(flow.seconds)} | ${preview} | ${video} | ${step}${shot} |`,
    );
  }
  out.push('');
  const reports = options.uiReports ?? [];
  if (reports.length > 0) {
    out.push(
      `**UI reports** (${String(reports.length)}): the app's \`[ui-qa]\` checks and the screen checks fail their shard too.`,
      '',
      '```',
      ...reports,
      '```',
      '',
    );
  }
  return out.join('\n');
}

function main(): void {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    allowPositionals: true,
    options: {
      media: { type: 'string' },
      'raw-url': { type: 'string' },
      'blob-url': { type: 'string' },
      'run-url': { type: 'string' },
      commit: { type: 'string' },
      out: { type: 'string' },
    },
  });
  const root = positionals[0];
  const { media, 'raw-url': rawUrl, 'blob-url': blobUrl } = values;
  if (!root || !media || !rawUrl || !blobUrl)
    throw new Error(
      'Usage: release-gate <shards dir> --media <dir> --raw-url <url> --blob-url <url>',
    );
  mkdirSync(path.resolve(media), { recursive: true });
  const rows = readGateFlows(path.resolve(root)).map((flow) => ({
    flow,
    media: buildMedia(flow, path.resolve(media)),
  }));
  const text = formatGateReport(rows, {
    rawUrl,
    blobUrl,
    ...(values['run-url'] ? { runUrl: values['run-url'] } : {}),
    ...(values.commit ? { commit: values.commit } : {}),
    uiReports: readShards(path.resolve(root)).flatMap((shard) =>
      [...shard.uiQa, ...shard.screenChecks].map((line) => `${shard.shard}: ${line}`),
    ),
  });
  if (values.out) writeFileSync(values.out, text);
  else console.log(text);
}

const isMainModule = import.meta.url === `file://${process.argv[1] ?? ''}`;
if (isMainModule) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
