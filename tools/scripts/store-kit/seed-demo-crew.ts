/**
 * The crew the store screenshots are captured from, made the way real people make one: each
 * traveller signs in anonymously, issues a pass and joins the crew through `/v1/cmd`, then the
 * crew's shared costs are added as expenses on its trip. Nothing is written to the database
 * directly.
 *
 *   pnpm tsx tools/scripts/store-kit/seed-demo-crew.ts --api <staging api> [--code K7M2QX]
 *       [--seed store] [--currency VND] [--state <file>] [--dry-run]
 *
 * With `--code` the travellers join the crew behind that code (the capture device's own crew);
 * without it the first traveller starts the crew and the code is printed for the device to join.
 * Every id and op id is derived from the seed name, and the travellers' sessions are kept in the
 * state file, so a second run replays the same commands and the api answers each as a duplicate.
 * Prints one JSON line: `{"crew_id", "trip_id", "code", "members", "expenses"}`.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { addExpensePayloadSchema, createCrewPayloadSchema } from '@cp/domain';

import { signInAnonymously, type ApiClient, type ApiSession } from '../seed-trip-day';
import { apiBaseIssue, assertSeedable } from './seed-guard';

const HOME = 'SGN';
const TZ = 'Asia/Ho_Chi_Minh';
/** Seed ids are UUIDv7s stamped with one fixed moment, so they sort together and never change. */
const EPOCH_MS = Date.UTC(2026, 0, 1);

/** A UUIDv7 that depends only on the seed name and what the id is for. */
export function seedUuid(seed: string, label: string): string {
  const bytes = createHash('sha256').update(`${seed}\n${label}`).digest().subarray(0, 16);
  bytes.writeUIntBE(EPOCH_MS, 0, 6);
  bytes[6] = 0x70 | ((bytes[6] ?? 0) & 0x0f);
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f);
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

interface PlannedExpense {
  readonly key: string;
  /** Index into the plan's travellers. */
  readonly payer: number;
  readonly category: 'stays' | 'food' | 'transit' | 'fun' | 'other';
  readonly description: string;
  /** Minor units per settlement currency the seed knows amounts for. */
  readonly amount: Readonly<Record<string, number>>;
}

export interface DemoCrewPlan {
  readonly crewName: string;
  readonly travellers: readonly string[];
  readonly expenses: readonly PlannedExpense[];
}

/** Who is in the demo crew and what they spent; the same for every run of a seed name. */
export function demoCrewPlan(seed: string): DemoCrewPlan {
  return {
    crewName: seed === 'store' ? 'Da Nang Crew' : `Da Nang Crew ${seed}`,
    travellers: ['Maya', 'Rin', 'Alex', 'Jordan', 'Sam'],
    expenses: [
      {
        key: 'villa',
        payer: 0,
        category: 'stays',
        description: 'Beach villa, 3 nights',
        amount: { VND: 9_600_000, USD: 38_400 },
      },
      {
        key: 'seafood',
        payer: 1,
        category: 'food',
        description: 'Seafood dinner',
        amount: { VND: 1_850_000, USD: 7_400 },
      },
      {
        key: 'airport-van',
        payer: 2,
        category: 'transit',
        description: 'Airport van',
        amount: { VND: 450_000, USD: 1_800 },
      },
      {
        key: 'ba-na',
        payer: 0,
        category: 'fun',
        description: 'Ba Na Hills tickets',
        amount: { VND: 4_500_000, USD: 18_000 },
      },
    ],
  };
}

export interface SeedState {
  /** Each traveller's session, by name; kept between runs so nobody is created twice. */
  travellers: Record<string, ApiSession>;
}

export interface SeedOptions {
  readonly seed: string;
  /** The crew to join; absent = the first traveller starts the crew. */
  readonly code?: string;
  /** The crew's settlement currency, which the expenses are added in. */
  readonly currency: string;
}

export interface SeededDemoCrew {
  readonly crew_id: string;
  readonly trip_id: string | null;
  readonly code: string;
  readonly members: readonly { readonly uid: string; readonly name: string }[];
  readonly expenses: number;
}

/** One command with a derived op id: a replay is the same op, which the api answers once. */
async function send(
  api: ApiClient,
  who: ApiSession,
  seed: string,
  cmd: string,
  payload: unknown,
): Promise<Record<string, unknown>> {
  const response = await api.fetch(`${api.baseUrl}/v1/cmd/${cmd}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: who.cookie },
    body: JSON.stringify({
      op_id: seedUuid(seed, `op:${who.uid}:${cmd}:${JSON.stringify(payload)}`),
      cmd,
      v: 1,
      actor: { uid: who.uid, via: 'app' },
      device: {
        id: seedUuid(seed, `device:${who.uid}`),
        platform: 'android',
        app_version: '1.0.0',
        tz: TZ,
      },
      client_ts: new Date(EPOCH_MS).toISOString(),
      payload,
    }),
  });
  const body = (await response.json()) as {
    status?: string;
    code?: string;
    result?: Record<string, unknown>;
    error?: unknown;
  };
  if (!response.ok || body.status === 'rejected') {
    throw new Error(
      `${cmd}: HTTP ${String(response.status)} ${JSON.stringify(body.error ?? body.code ?? body)}`,
    );
  }
  return body.result ?? {};
}

function amountIn(expense: PlannedExpense, currency: string): number {
  const amount = expense.amount[currency];
  if (amount === undefined) {
    throw new Error(
      `--currency: the seed has amounts in ${Object.keys(expense.amount).join(', ')}`,
    );
  }
  return amount;
}

export async function seedDemoCrew(
  api: ApiClient,
  options: SeedOptions,
  state: SeedState,
): Promise<SeededDemoCrew> {
  const plan = demoCrewPlan(options.seed);
  for (const expense of plan.expenses) amountIn(expense, options.currency);

  const members: (ApiSession & { name: string })[] = [];
  let code = options.code;
  let crewId: string | undefined;
  let tripId: string | null = null;
  for (const name of plan.travellers) {
    const session = (state.travellers[name] ??= await signInAnonymously(api));
    const passId = seedUuid(options.seed, `pass:${name}`);
    await send(api, session, options.seed, 'start_pass', { pass_id: passId });
    await send(api, session, options.seed, 'issue_pass', {
      pass_id: passId,
      given_name: name,
      avatar: { kind: 'initials' },
      taste_answers: [],
      home_iata: HOME,
    });
    if (code === undefined) {
      const created = await send(
        api,
        session,
        options.seed,
        'create_crew',
        createCrewPayloadSchema.parse({
          crew_id: seedUuid(options.seed, 'crew'),
          name: plan.crewName,
        }),
      );
      crewId = created['crew_id'] as string;
      code = created['code'] as string;
    } else {
      const joined = await send(api, session, options.seed, 'accept_invite', { code });
      crewId = joined['crew_id'] as string;
      tripId = (joined['trip_id'] as string | null | undefined) ?? tripId;
    }
    members.push({ ...session, name });
  }
  if (crewId === undefined || code === undefined) throw new Error('the demo crew is empty');

  let expenses = 0;
  if (tripId !== null) {
    for (const expense of plan.expenses) {
      const payer = members[expense.payer];
      if (payer === undefined) throw new Error(`expense ${expense.key} has no payer`);
      const payload = addExpensePayloadSchema.parse({
        expense_id: seedUuid(options.seed, `expense:${expense.key}`),
        trip_id: tripId,
        amount_minor: amountIn(expense, options.currency),
        currency: options.currency,
        payer_uid: payer.uid,
        split: { mode: 'equal', shares: members.map((member) => ({ user_id: member.uid })) },
        category: expense.category,
        description: expense.description,
      });
      await send(api, payer, options.seed, 'add_expense', payload);
      expenses += 1;
    }
  }
  return {
    crew_id: crewId,
    trip_id: tripId,
    code,
    members: members.map(({ uid, name }) => ({ uid, name })),
    expenses,
  };
}

const DEFAULT_STATE = fileURLToPath(new URL('./.seed-state.json', import.meta.url));

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    options: {
      api: { type: 'string' },
      code: { type: 'string' },
      seed: { type: 'string', default: 'store' },
      currency: { type: 'string', default: 'VND' },
      state: { type: 'string', default: DEFAULT_STATE },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  if (values.api === undefined) {
    throw new Error('usage: seed-demo-crew.ts --api <url> [--code <crew code>] [--dry-run]');
  }
  const baseUrl = values.api.replace(/\/+$/u, '');
  const options: SeedOptions = {
    seed: values.seed,
    currency: values.currency.toUpperCase(),
    ...(values.code !== undefined ? { code: values.code.toUpperCase() } : {}),
  };
  if (values['dry-run']) {
    const issue = apiBaseIssue(baseUrl);
    if (issue !== undefined) throw new Error(`refusing to seed: ${issue}`);
    const plan = demoCrewPlan(options.seed);
    for (const expense of plan.expenses) amountIn(expense, options.currency);
    process.stdout.write(`${JSON.stringify({ api: baseUrl, ...options, plan })}\n`);
    return;
  }
  await assertSeedable(baseUrl, fetch);
  const state: SeedState = existsSync(values.state)
    ? (JSON.parse(readFileSync(values.state, 'utf8')) as SeedState)
    : { travellers: {} };
  try {
    const seeded = await seedDemoCrew({ baseUrl, fetch }, options, state);
    process.stdout.write(`${JSON.stringify(seeded)}\n`);
  } finally {
    // Sessions are saved even when a later command failed, so the next run reuses the travellers.
    writeFileSync(values.state, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
