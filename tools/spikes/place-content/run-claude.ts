/**
 * The same 20 profiles and two briefs written by Claude Sonnet 5 through the Claude Code CLI on the
 * subscription login: one headless session per item with only WebSearch and WebFetch, at most
 * three at a time. Runs outside `railway run` (no provider keys in its environment). Writes one
 * `claude/<key>.json` per item (skips items already written) with latency and token counts.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { BRIEF_RULES, BRIEF_SCHEMA } from './brief';
import { DESTINATIONS, type DestinationSlug, type SamplePlace } from './db';
import { OUT, readOut } from './lib';
import { PROFILE_RULES, PROFILE_SCHEMA } from './profile';

const CLI = '/Users/quocs/.local/bin/claude';
let stopped = false;
const CWD = join(OUT, 'claude-cwd');
const DIR = join(OUT, 'claude');
mkdirSync(CWD, { recursive: true });
mkdirSync(DIR, { recursive: true });

const RESEARCH = [
  'Research with WebSearch and WebFetch: search in English and Vietnamese and fetch the most useful',
  'pages. "The pages" below means the pages you found; each quote must be copied exactly from the',
  'page at its source_url. Reply with the JSON object only, no prose, matching this JSON Schema:',
].join('\n');

function profilePrompt(place: SamplePlace): string {
  const city = DESTINATIONS[place.destination];
  return [
    PROFILE_RULES,
    '',
    RESEARCH,
    JSON.stringify(PROFILE_SCHEMA),
    '',
    `Place: ${place.name}${place.nameLocal === null ? '' : ` (${place.nameLocal})`}`,
    `City: ${city.name}, Vietnam. Kind: ${place.category}. Address: ${place.address ?? 'unknown'}.`,
  ].join('\n');
}

function briefPrompt(slug: DestinationSlug): string {
  return [
    BRIEF_RULES,
    '',
    RESEARCH,
    JSON.stringify(BRIEF_SCHEMA),
    '',
    `City: ${DESTINATIONS[slug].name}, Vietnam.`,
  ].join('\n');
}

interface Item {
  readonly key: string;
  readonly prompt: string;
}

function runOne(item: Item): Promise<void> {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_BASE_URL;
  const args = [
    '-p',
    item.prompt,
    '--model',
    'claude-sonnet-5',
    '--allowedTools',
    'WebSearch,WebFetch',
    '--output-format',
    'json',
    '--setting-sources',
    'project',
    '--strict-mcp-config',
  ];
  const started = performance.now();
  return new Promise((resolve) => {
    const child = spawn(CLI, args, { cwd: CWD, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()));
    child.on('close', (code) => {
      const ms = Math.round(performance.now() - started);
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(out) as Record<string, unknown>;
      } catch {
        parsed = { parse_error: true, tail: out.slice(-300) };
      }
      const text = typeof parsed.result === 'string' ? parsed.result : '';
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      let json: unknown = null;
      try {
        json = start >= 0 ? JSON.parse(text.slice(start, end + 1)) : null;
      } catch {
        json = null;
      }
      const record = {
        key: item.key,
        exit: code,
        ms,
        is_error: parsed.is_error ?? true,
        subtype: parsed.subtype ?? null,
        num_turns: parsed.num_turns ?? null,
        usage: parsed.usage ?? null,
        list_usd: parsed.total_cost_usd ?? null,
        json,
        error_text: json === null ? text.slice(0, 400) : null,
      };
      if (record.is_error !== true || json !== null) {
        writeFileSync(join(DIR, `${item.key}.json`), JSON.stringify(record, null, 2));
      }
      console.log(`${item.key.padEnd(40)} ${ms} ms ${json === null ? 'NO JSON' : 'ok'}`);
      // A usage limit stops the batch: what finished is reported, nothing is retried.
      if (json === null && /limit|rate|quota|overloaded/iu.test(`${text} ${out.slice(-300)}`)) {
        stopped = true;
        console.log(`stopping: ${text.slice(0, 160)}`);
      }
      resolve();
    });
  });
}

const sample = readOut<SamplePlace[]>('sample.json');
const filter = process.argv[2] ?? '';
const items: Item[] = [
  ...sample.map((p) => ({ key: `profile-${p.id}`, prompt: profilePrompt(p) })),
  ...(['vn-da-lat', 'vn-hue'] as const).map((s) => ({ key: `brief-${s}`, prompt: briefPrompt(s) })),
].filter((i) => i.key.includes(filter) && !existsSync(join(DIR, `${i.key}.json`)));

async function worker(): Promise<void> {
  for (let item = items.shift(); item !== undefined && !stopped; item = items.shift()) {
    await runOne(item);
  }
}
await Promise.all([worker(), worker(), worker()]);
