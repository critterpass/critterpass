/**
 * "Start as" (Developer tools, device flows): a cleared install becomes a signed-in, onboarded
 * account holding one of the api's seed scenarios, without walking onboarding or building a trip
 * in the app. The steps run in order and each has one way to fail, told in one line:
 *
 *   request  the scenario and language asked for are known, and this install has no account yet
 *   account  the app session starts (an anonymous sign-in through the api)
 *   pass     the pass is issued the way onboarding issues it, and its row comes back through sync
 *   seed     the api builds the scenario for this account (`POST /v1/dev/seed-demo`)
 *   sync     the scenario's crew, trip and inbox rows reach this phone
 *
 * It ends ready (onboarding marked complete, Home next) or failed with the step and its line. The
 * device wiring is passed in by the (dev) route, the only importer: release bundles never contain
 * this file.
 */
/* eslint-disable lingui/no-unlocalized-strings -- developer-facing status lines of a dev-only
   screen, read in screenshots of failed device runs; never product copy. */
import {
  DEMO_SCENARIOS,
  SeedRefusedError,
  type DemoScenario,
  type SeedDemoOutcome,
} from './seed-demo';

export const START_AS_LANGS = ['en', 'vi'] as const;
export type StartAsLang = (typeof START_AS_LANGS)[number];

export type StartAsStep = 'request' | 'account' | 'pass' | 'seed' | 'sync';

export interface StartAsRequest {
  readonly scenario: DemoScenario;
  readonly lang: StartAsLang;
}

/** How long each wait may take before its step fails. */
export const START_AS_PASS_TIMEOUT_MS = 45_000;
export const START_AS_SYNC_TIMEOUT_MS = 60_000;

/** The demo world lives in Singapore dollars and rupiah; the start scenarios are a Vietnamese crew's. */
const DEMO_WORLD: ReadonlySet<DemoScenario> = new Set([
  'everyday',
  'inbox',
  'caught_up',
  'vote',
  'vote_final',
]);

/** The home airport the account's pass is issued from. */
export function homeFor(scenario: DemoScenario): 'SIN' | 'SGN' {
  return DEMO_WORLD.has(scenario) ? 'SIN' : 'SGN';
}

export type StartAsFailure =
  | { readonly step: 'request'; readonly why: 'unknown_scenario'; readonly asked: string }
  | { readonly step: 'request'; readonly why: 'unknown_lang'; readonly asked: string }
  | { readonly step: 'request'; readonly why: 'has_account' }
  | { readonly step: 'account'; readonly message: string }
  | { readonly step: 'pass'; readonly seconds: number }
  | { readonly step: 'seed'; readonly refused: SeedRefusedError }
  | { readonly step: 'seed'; readonly message: string }
  | { readonly step: 'sync'; readonly seconds: number };

/** A fetch that never reached the api: React Native, Node and Android word it differently. */
export function isNetworkFailure(message: string): boolean {
  return /network request failed|fetch failed|unable to resolve host|failed to connect|timed? ?out|ECONN|ENOTFOUND/i.test(
    message,
  );
}

function refusalLine(refused: SeedRefusedError): string {
  const what = [`HTTP ${String(refused.status)}`, refused.code, refused.reason]
    .filter((part) => part !== null && part !== '')
    .join(' ');
  if (refused.status === 404) return `Seed refused (${what}): this api has no dev seed mounted.`;
  if (refused.code === 'VALIDATION')
    return `Seed refused (${what}): this api does not know the scenario yet.`;
  return `Seed refused (${what}).`;
}

/** The one line the failed state shows. */
export function failureLine(failure: StartAsFailure): string {
  switch (failure.step) {
    case 'request':
      if (failure.why === 'has_account')
        return 'This install already has an account: clear the app data and launch again.';
      return failure.why === 'unknown_scenario'
        ? `Unknown scenario "${failure.asked}". Known: ${DEMO_SCENARIOS.join(', ')}.`
        : `Unknown language "${failure.asked}". Known: ${START_AS_LANGS.join(', ')}.`;
    case 'account':
      return isNetworkFailure(failure.message)
        ? `Network: the api cannot be reached, so no account (${failure.message}).`
        : `No account: the session did not start (${failure.message}).`;
    case 'pass':
      return `Pass not issued: its row did not come back after ${String(failure.seconds)} s.`;
    case 'seed':
      if ('refused' in failure) return refusalLine(failure.refused);
      return isNetworkFailure(failure.message)
        ? `Network: the seed request did not reach the api (${failure.message}).`
        : `Seed failed (${failure.message}).`;
    case 'sync':
      return `Rows not synced after ${String(failure.seconds)} s: the scenario is on the server, not on this phone.`;
  }
}

/** Reads what a launch argument or the screen's params asked for. */
export function parseStartAsRequest(
  scenario: string | undefined,
  lang: string | undefined,
): StartAsRequest | StartAsFailure {
  const asked = (scenario ?? '').trim();
  const known = DEMO_SCENARIOS.find((name) => name === asked);
  if (known === undefined) return { step: 'request', why: 'unknown_scenario', asked };
  const askedLang = (lang ?? '').trim();
  const knownLang = askedLang === '' ? 'en' : START_AS_LANGS.find((name) => name === askedLang);
  if (knownLang === undefined) return { step: 'request', why: 'unknown_lang', asked: askedLang };
  return { scenario: known, lang: knownLang };
}

export interface StartAsPorts {
  /** True when onboarding already completed on this install. */
  hasAccount(): boolean;
  /** Starts the app session; rejects when the api cannot be reached. */
  startSession(): Promise<void>;
  setLanguage(lang: StartAsLang): Promise<void>;
  /** Fills in and issues the pass on the device (the app's own sync then sends it); resolves its id. */
  issuePass(homeIata: string): Promise<string>;
  /** Whether the issued pass has come back from the server through sync. */
  passIssued(passId: string): Promise<boolean>;
  /** Asks the api for the scenario and waits for its rows; `synced` false when they did not arrive. */
  seed(scenario: DemoScenario, syncTimeoutMs: number): Promise<SeedDemoOutcome>;
  markOnboarded(): void;
  readonly wait: (ms: number) => Promise<void>;
  readonly now: () => number;
  readonly passTimeoutMs?: number;
  readonly syncTimeoutMs?: number;
  readonly pollMs?: number;
}

export type StartAsResult =
  | {
      readonly kind: 'ready';
      readonly request: StartAsRequest;
      readonly crewId: string;
      readonly tripId: string | null;
      readonly code: string | null;
    }
  | { readonly kind: 'failed'; readonly failure: StartAsFailure; readonly line: string };

const failed = (failure: StartAsFailure): StartAsResult => ({
  kind: 'failed',
  failure,
  line: failureLine(failure),
});

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export async function runStartAs(
  ports: StartAsPorts,
  asked: { readonly scenario: string | undefined; readonly lang: string | undefined },
  onStep: (step: StartAsStep) => void = () => undefined,
): Promise<StartAsResult> {
  onStep('request');
  const request = parseStartAsRequest(asked.scenario, asked.lang);
  if ('step' in request) return failed(request);
  if (ports.hasAccount()) return failed({ step: 'request', why: 'has_account' });

  onStep('account');
  try {
    await ports.startSession();
  } catch (error) {
    return failed({ step: 'account', message: messageOf(error) });
  }
  await ports.setLanguage(request.lang);

  onStep('pass');
  const passTimeoutMs = ports.passTimeoutMs ?? START_AS_PASS_TIMEOUT_MS;
  const passId = await ports.issuePass(homeFor(request.scenario));
  const deadline = ports.now() + passTimeoutMs;
  let issued = await ports.passIssued(passId);
  while (!issued && ports.now() < deadline) {
    await ports.wait(ports.pollMs ?? 500);
    issued = await ports.passIssued(passId);
  }
  if (!issued) return failed({ step: 'pass', seconds: Math.round(passTimeoutMs / 1000) });

  onStep('seed');
  const syncTimeoutMs = ports.syncTimeoutMs ?? START_AS_SYNC_TIMEOUT_MS;
  let seeded: SeedDemoOutcome;
  try {
    // The seed call answers once the request is back and its rows are in (or the wait ran out).
    seeded = await ports.seed(request.scenario, syncTimeoutMs);
  } catch (error) {
    return failed(
      error instanceof SeedRefusedError
        ? { step: 'seed', refused: error }
        : { step: 'seed', message: messageOf(error) },
    );
  }
  onStep('sync');
  if (!seeded.synced) return failed({ step: 'sync', seconds: Math.round(syncTimeoutMs / 1000) });

  ports.markOnboarded();
  return {
    kind: 'ready',
    request,
    crewId: seeded.crewId,
    tripId: seeded.tripId,
    code: seeded.code,
  };
}
