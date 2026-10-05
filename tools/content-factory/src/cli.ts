/**
 * `pnpm content <kind> <command>`: brief | generate | validate | render | review | run | resume | pull.
 *
 *   pnpm content forms run                  new batch through every stage up to review
 *   pnpm content forms resume               finish the latest batch (generation resumes from cache)
 *   pnpm content forms validate --all       re-check every committed batch of the kind
 *   pnpm content forms pull                 copy the live release into packages/content
 *   pnpm content places page --batch <key>  write the batch's one-page review (--opt left_out=<file>)
 *   pnpm content places corrections --batch <key>  build a hand-made corrections batch and its review
 *
 * Flags: --batch <key>, --max-usd <n>, --concurrency <n>, --opt key=value (kind options).
 * Reads DATABASE_URL, ANTHROPIC_API_KEY and TAVILY_API_KEY from the environment or `.env`
 * (`CP_ENV_FILE` points at another file).
 */
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createGateway, loadGatewayEnv, type Gateway } from '@cp/ai';
import { contentKindSchema, type ContentKind } from '@cp/content';

import { curatedDestinations } from './data/place-facts';
import { openPool, liveArtifact } from './db';
import './kinds/index';
import {
  checkCommittedRenders,
  latestBatchKey,
  nextBatchKey,
  runPipeline,
  validateCommitted,
  type Stage,
} from './pipeline';
import {
  approveCrowdCurves,
  placesWithoutCurves,
  proposeCrowdCurves,
  storeCrowdProposals,
} from './kinds/places/crowds';
import { placeCorrectionsCommand } from './kinds/places/corrections-command';
import { readCrowdReview, renderCrowdReview } from './kinds/places/crowds-review';
import { placeFactsCommand } from './kinds/places/facts';
import { poisWithoutHours, researchHours, storeProposals } from './kinds/places/hours';
import { writePlacesReview } from './kinds/places/review-page';
import { recordingFetch } from './record';
import { searchFromEnv } from './search';
import { writeCurrentRelease } from './stages/pull';
import { FACTORY_DIR, REPO_DIR } from './work';

const COMMANDS = [
  'brief',
  'generate',
  'validate',
  'render',
  'review',
  'run',
  'resume',
  'pull',
  'hours',
  'crowds',
  'facts',
  'page',
  'corrections',
] as const;
type Command = (typeof COMMANDS)[number];

const STAGES_FOR = {
  brief: ['brief'],
  generate: ['generate'],
  validate: ['validate'],
  render: ['render'],
  review: ['review'],
  run: ['brief', 'generate', 'validate', 'render', 'review'],
  resume: ['generate', 'validate', 'render', 'review'],
} satisfies Partial<Record<Command, readonly Stage[]>>;

export interface CliArgs {
  readonly kind: ContentKind;
  readonly command: Command;
  readonly batch: string | undefined;
  readonly all: boolean;
  readonly check: boolean;
  readonly maxUsd: number | undefined;
  readonly concurrency: number | undefined;
  readonly options: Readonly<Record<string, string>>;
}

export function parseCliArgs(argv: readonly string[]): CliArgs {
  const [rawKind, rawCommand, ...rest] = argv;
  const kind = contentKindSchema.parse(rawKind?.replaceAll('-', '_'));
  if (!(COMMANDS as readonly string[]).includes(rawCommand ?? '')) {
    throw new Error(`command must be one of ${COMMANDS.join(', ')}`);
  }
  const options: Record<string, string> = {};
  let batch: string | undefined;
  let maxUsd: number | undefined;
  let concurrency: number | undefined;
  let all = false;
  let check = false;
  for (let i = 0; i < rest.length; i += 1) {
    const flag = rest[i];
    const value = () => {
      i += 1;
      const next = rest[i];
      if (next === undefined) throw new Error(`${flag} needs a value`);
      return next;
    };
    if (flag === '--all') all = true;
    else if (flag === '--check') check = true;
    else if (flag === '--batch') batch = value();
    else if (flag === '--max-usd') maxUsd = Number(value());
    else if (flag === '--concurrency') concurrency = Number(value());
    else if (flag === '--opt') {
      const [key, ...parts] = value().split('=');
      if (key === undefined || parts.length === 0) throw new Error('--opt takes key=value');
      options[key] = parts.join('=');
    } else throw new Error(`unknown flag ${flag}`);
  }
  return { kind, command: rawCommand as Command, batch, all, check, maxUsd, concurrency, options };
}

function loadEnv(): void {
  const file = process.env['CP_ENV_FILE'] ?? path.join(REPO_DIR, '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

function gatewayFromEnv(): Gateway | null {
  if (!process.env['ANTHROPIC_API_KEY']) return null;
  const record = process.env['CONTENT_FACTORY_RECORD'];
  return createGateway({
    ...loadGatewayEnv(),
    ...(record ? { fetch: recordingFetch(record) } : {}),
  });
}

const PLACES_DESTINATIONS = curatedDestinations()
  .map((d) => d.slug)
  .join(',');

/**
 * Proposes editorial crowd curves and writes the one-page review; `--opt approve=<batch>` approves
 * what that page showed, attributed to the operator `ADMIN_CLI_EMAIL` names.
 */
async function crowdCurves(
  pool: NonNullable<ReturnType<typeof openPool>>,
  args: CliArgs,
  log: (line: string) => void,
): Promise<number> {
  const destinations = (args.options['destinations'] ?? PLACES_DESTINATIONS).split(',');
  const now = new Date();
  const approve = args.options['approve'];
  if (approve !== undefined) {
    const approverEmail = process.env['ADMIN_CLI_EMAIL'];
    if (!approverEmail) throw new Error('approving crowd curves needs ADMIN_CLI_EMAIL');
    const places = await approveCrowdCurves(pool, {
      destinations,
      approverEmail,
      batchKey: approve,
      now,
    });
    log(`crowds: approved the curves of ${places} places (${approve})`);
    return 0;
  }
  const batchKey = args.batch ?? `${now.toISOString().slice(0, 10)}-crowds`;
  const candidates = await placesWithoutCurves(pool, destinations);
  const { proposals, rejected } = await proposeCrowdCurves(candidates, {
    gateway: gatewayFromEnv(),
    now,
  });
  await storeCrowdProposals(pool, proposals, now);
  const dir = path.join(FACTORY_DIR, 'work', 'places');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `crowds-review-${batchKey}.html`);
  writeFileSync(file, renderCrowdReview(await readCrowdReview(pool, destinations), batchKey));
  log(
    `crowds: ${proposals.length} of ${candidates.length} places have a proposed curve, ${rejected.length} rejected; review ${file}, then approve with --opt approve=${batchKey}`,
  );
  return 0;
}

export async function main(argv: readonly string[], log = console.log): Promise<number> {
  loadEnv();
  const args = parseCliArgs(argv);
  const pool = openPool();
  try {
    if (args.command === 'pull') {
      if (pool === null) throw new Error('pull reads the live release: set DATABASE_URL');
      const version = writeCurrentRelease(args.kind, await liveArtifact(pool, args.kind));
      log(`pull: packages/content/releases/${args.kind}/current.json is v${version}`);
      return 0;
    }
    if (args.command === 'page') {
      const batch = args.batch ?? latestBatchKey(args.kind);
      if (args.kind !== 'places' || batch === undefined)
        throw new Error('page writes the review of a places batch');
      log(`page: ${writePlacesReview(batch, args.options['left_out'])}`);
      return 0;
    }
    if (args.command === 'corrections') {
      if (args.kind !== 'places' || args.batch === undefined)
        throw new Error('corrections builds a places batch: give --batch');
      const snapshot = args.options['snapshot'] !== undefined;
      return await placeCorrectionsCommand(
        { batchKey: args.batch, snapshot, pool, now: new Date() },
        log,
      );
    }
    if (args.command === 'hours') {
      if (args.kind !== 'places' || pool === null)
        throw new Error('hours runs on places with DATABASE_URL set');
      const destinations = (args.options['destinations'] ?? PLACES_DESTINATIONS).split(',');
      const now = new Date();
      const candidates = await poisWithoutHours(pool, destinations);
      const proposals = await researchHours(candidates, {
        search: searchFromEnv(),
        gateway: gatewayFromEnv(),
        now,
      });
      const batchKey = args.batch ?? `${now.toISOString().slice(0, 10)}-hours`;
      await storeProposals(pool, batchKey, proposals);
      log(
        `hours: ${proposals.length} of ${candidates.length} POIs have proposed hours waiting for verification`,
      );
      return 0;
    }
    if (args.command === 'facts') {
      if (args.kind !== 'places' || pool === null)
        throw new Error('facts runs on places with DATABASE_URL set');
      const gateway = gatewayFromEnv();
      const search = searchFromEnv();
      return await placeFactsCommand(
        pool,
        {
          destinations: (args.options['destinations'] ?? PLACES_DESTINATIONS).split(','),
          batch: args.batch,
          approve: args.options['approve'],
          approverEmail: process.env['ADMIN_CLI_EMAIL'],
          deps: gateway === null || search === null ? null : { gateway, search },
          now: new Date(),
        },
        log,
      );
    }
    if (args.command === 'crowds') {
      if (args.kind !== 'places' || pool === null)
        throw new Error('crowds runs on places with DATABASE_URL set');
      return await crowdCurves(pool, args, log);
    }
    if (args.command === 'validate' && args.all) {
      const results = validateCommitted(args.kind);
      for (const { batchKey, report } of results) {
        log(
          `${batchKey}: ${report.counts.pass} pass · ${report.counts.warn} warn · ${report.counts.fail} fail`,
        );
        for (const problem of report.batch) log(`  ${problem.severity}: ${problem.message}`);
        for (const item of report.items.filter((r) => r.severity === 'fail').slice(0, 20)) {
          log(`  fail ${item.ref}: ${item.checks.map((c) => c.message).join('; ')}`);
        }
      }
      if (results.length === 0) log(`no committed ${args.kind} batches yet`);
      return results.some((r) => r.report.severity === 'fail') ? 1 : 0;
    }
    if (args.command === 'render' && args.check) {
      const out = mkdtempSync(path.join(os.tmpdir(), `content-${args.kind}-`));
      const results = await checkCommittedRenders(args.kind, out);
      for (const { batchKey, missing } of results) {
        log(
          `${batchKey}: ${missing.length === 0 ? 'every item rendered' : `missing ${missing.join(', ')}`} (${out})`,
        );
      }
      return results.some((r) => r.missing.length > 0) ? 1 : 0;
    }
    const now = new Date();
    const batchKey =
      args.batch ??
      (args.command === 'run' ? nextBatchKey(args.kind, now) : latestBatchKey(args.kind));
    if (batchKey === undefined) throw new Error(`no ${args.kind} batch yet: start one with run`);
    log(`${args.kind} · ${batchKey}`);
    const result = await runPipeline({
      kind: args.kind,
      batchKey,
      stages: STAGES_FOR[args.command],
      pool,
      gateway: args.command === 'validate' ? null : gatewayFromEnv(),
      now,
      options: args.options,
      log,
      ...(args.maxUsd === undefined ? {} : { maxCostMicros: Math.round(args.maxUsd * 1_000_000) }),
      ...(args.concurrency === undefined ? {} : { concurrency: args.concurrency }),
    });
    return result.report?.severity === 'fail' ? 1 : 0;
  } finally {
    await pool?.end();
  }
}

if (process.argv[1] !== undefined && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    },
  );
}
