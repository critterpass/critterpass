/**
 * Route → model and request shape (docs/api-contracts.md §6 "Model routing"). Generation runs on
 * DeepSeek with explicit model ids: the fast tier
 * (`deepseek-flash`, vision-capable) answers chat, voice, parsing, photo work and short lines; the
 * pro tier (`deepseek-v4-pro`, text only) plans, redrafts, proposes, narrates recaps, writes the
 * content libraries, runs the guest guide and builds the itinerary skeleton. Swapping a model is a
 * change to `MODEL_IDS` plus a full eval run; the gateway's provider seam (./client.ts) is where a
 * second provider would plug in.
 *
 * Thinking: DeepSeek thinks by default, so every route states it. Streamed and fast routes run
 * without thinking (it delays the first token); pro job routes think with an explicit effort. A
 * thinking request rejects a forced tool choice, and a tool choice of `any` is not enforced at all.
 *
 * Decision routes (a closed label, a yes/no probability or a rubric score) run on TypeSafe's Jev,
 * pinned to `jev-1.13.0` because thresholds are tuned per version, and name a fast-tier twin that
 * answers the same shape when Jev is unavailable (./decide). No generation route may run on Jev.
 */
import {
  DECISION_THRESHOLDS,
  type AiCaller,
  type AiProvider,
  type AiRoute,
  type AiTier,
  type DecisionRoute,
  type DecisionThresholds,
  type GenerationTier,
} from '@cp/domain';

/** The Jev version decision thresholds were tuned against; never the moving `jev-latest` alias. */
export const JEV_MODEL = 'jev-1.13.0';

export const MODEL_IDS: Readonly<Record<AiTier, string>> = {
  fast: 'deepseek-flash',
  pro: 'deepseek-v4-pro',
  jev: JEV_MODEL,
};

/** Tiers whose model reads images (receipts, menus, photos). */
export const VISION_TIERS: ReadonlySet<AiTier> = new Set<AiTier>(['fast']);

/** Prompt layers in cache order (tools first, conversation last). */
export const CACHE_LAYERS = [
  'tools',
  'global_rules',
  'persona',
  'destination',
  'trip',
  'conversation',
] as const;
export type CacheLayer = (typeof CACHE_LAYERS)[number];

export type Thinking = 'disabled' | 'enabled';
/** DeepSeek reasoning effort; only sent when thinking is on. */
export type Effort = 'low' | 'high';
export type Delivery = 'stream' | 'call' | 'batch';

export interface RouteConfig {
  readonly route: AiRoute;
  readonly provider: AiProvider;
  readonly tier: AiTier;
  readonly model: string;
  /** Tool allow-list class; `null` = no tools at all. */
  readonly caller: AiCaller | null;
  readonly thinking: Thinking;
  /** `output_config.effort` for thinking routes. */
  readonly effort: Effort | undefined;
  /** Sampling temperature for routes without thinking (thinking ignores it); unset = default. */
  readonly temperature: number | undefined;
  /** Output budget; on thinking routes it covers the reasoning too. */
  readonly maxTokens: number;
  readonly output: 'text' | 'structured';
  readonly delivery: Delivery;
  /** Reads images (receipts, menus, photos): only on a vision tier. */
  readonly vision: boolean;
  /** Our own `web_search` tool (./tools/web-search.ts) is offered on this route. */
  readonly webSearch: boolean;
  readonly cacheLayers: readonly CacheLayer[];
  /** Decision routes: the fast-tier twin run when Jev cannot answer. */
  readonly fallback: RouteConfig | undefined;
  /** Decision routes: the verdict bands tuned for this route. */
  readonly thresholds: DecisionThresholds | undefined;
}

const GUIDE_LAYERS = CACHE_LAYERS;
const JOB_LAYERS: readonly CacheLayer[] = [
  'tools',
  'global_rules',
  'persona',
  'destination',
  'trip',
];
const PLAIN_LAYERS: readonly CacheLayer[] = ['global_rules'];

interface RouteSpec {
  readonly tier: GenerationTier;
  readonly caller: AiCaller | null;
  readonly thinking: Thinking;
  readonly effort?: Effort;
  readonly temperature?: number;
  readonly maxTokens: number;
  readonly output: 'text' | 'structured';
  readonly delivery: Delivery;
  readonly vision?: boolean;
  readonly webSearch?: boolean;
  readonly cacheLayers: readonly CacheLayer[];
}

type SpecOptions = Partial<
  Pick<RouteSpec, 'output' | 'delivery' | 'cacheLayers' | 'vision' | 'webSearch' | 'temperature'>
>;

/**
 * Guide conversation routes sample cooler than the provider default: the persona still reads as
 * itself, and the rules (sentence caps, data blocks, declines) hold turn after turn.
 */
export const GUIDE_TEMPERATURE = 0.5;

/** A fast-tier route: no thinking. */
const fast = (caller: AiCaller | null, maxTokens: number, rest: SpecOptions = {}): RouteSpec => ({
  tier: 'fast',
  caller,
  thinking: 'disabled',
  maxTokens,
  output: rest.output ?? 'text',
  delivery: rest.delivery ?? 'call',
  vision: rest.vision ?? false,
  webSearch: rest.webSearch ?? false,
  cacheLayers: rest.cacheLayers ?? PLAIN_LAYERS,
  ...(rest.temperature === undefined ? {} : { temperature: rest.temperature }),
});

/**
 * A pro-tier route. Streamed routes are latency-bound, so they answer without thinking; job
 * routes think at `effort`.
 */
const pro = (
  caller: AiCaller | null,
  maxTokens: number,
  effort: Effort,
  rest: SpecOptions = {},
): RouteSpec => {
  const delivery = rest.delivery ?? 'call';
  const thinking: Thinking = delivery === 'stream' ? 'disabled' : 'enabled';
  return {
    tier: 'pro',
    caller,
    thinking,
    ...(thinking === 'enabled' ? { effort } : {}),
    maxTokens,
    output: rest.output ?? 'text',
    delivery,
    webSearch: rest.webSearch ?? false,
    cacheLayers: rest.cacheLayers ?? JOB_LAYERS,
    ...(thinking === 'disabled' && rest.temperature !== undefined
      ? { temperature: rest.temperature }
      : {}),
  };
};

const GUIDE_STREAM: SpecOptions = {
  delivery: 'stream',
  cacheLayers: GUIDE_LAYERS,
  temperature: GUIDE_TEMPERATURE,
};

/** Fast-tier twin of a decision route: no tools, a small JSON answer, no thinking. */
const twin = (): RouteSpec => fast(null, 512, { output: 'structured' });

const GENERATION_SPECS: Readonly<Record<Exclude<AiRoute, DecisionRoute>, RouteSpec>> = {
  'guide.chat': fast('C', 1024, GUIDE_STREAM),
  'guide.voice': fast('C', 512, GUIDE_STREAM),
  'guide.crew_mention': fast('G', 1024, GUIDE_STREAM),
  'quests.generate': fast('B', 4096, {
    output: 'structured',
    delivery: 'batch',
    cacheLayers: JOB_LAYERS,
  }),
  'roundup.evening': fast('B', 512, { cacheLayers: JOB_LAYERS }),
  'email.parse': fast('M', 2048, { output: 'structured' }),
  'must_do.fit_line': fast(null, 128),
  'micro.line': fast(null, 128),
  'tips.phrase': fast(null, 256),
  'season.research': fast(null, 2048, { output: 'structured' }),
  'pitch.place': fast(null, 1024, { delivery: 'stream', cacheLayers: JOB_LAYERS }),
  'briefing.daily': fast('B', 2048, { output: 'structured', cacheLayers: JOB_LAYERS }),
  'photo.picks': fast(null, 2048, { output: 'structured', vision: true }),
  'avatar.moderate': fast(null, 256, { output: 'structured', vision: true }),
  'receipt.parse': fast('M', 4096, { output: 'structured', vision: true }),
  'menu.parse': fast('M', 4096, { output: 'structured', delivery: 'stream', vision: true }),
  'guide.chat_escalation': pro('C', 2048, 'low', GUIDE_STREAM),
  'draft.day': pro('D', 16_000, 'low', { output: 'structured' }),
  'draft.repair': pro('D', 8192, 'low', { output: 'structured' }),
  'redraft.day': pro('D', 16_000, 'high', { output: 'structured' }),
  'proposal.personal': pro('D', 8192, 'low', { output: 'structured' }),
  'disruption.plan_b': pro('R', 8192, 'low', { output: 'structured' }),
  'recap.narration': pro('B', 16_000, 'low', { output: 'structured' }),
  'notification.templates': pro(null, 16_000, 'low', {
    output: 'structured',
    delivery: 'batch',
    cacheLayers: ['global_rules', 'persona'],
  }),
  'content.factory': pro(null, 16_000, 'low', {
    output: 'structured',
    delivery: 'batch',
    cacheLayers: ['global_rules', 'persona', 'destination'],
  }),
  'email.parse_fallback': pro('M', 8192, 'low', {
    output: 'structured',
    cacheLayers: PLAIN_LAYERS,
  }),
  'guest.guide': pro('C', 2048, 'low', { ...GUIDE_STREAM, webSearch: true }),
  'draft.skeleton': pro('D', 32_000, 'high', { output: 'structured' }),
};

const DECISION_SPECS: Readonly<Record<DecisionRoute, RouteSpec>> = {
  'guide.chime_in_classifier': twin(),
  'help.intent_classifier': twin(),
  'idea.duplicate_tiebreak': twin(),
  'poi.duplicate_tiebreak': twin(),
  'compliance.check': twin(),
  'availability.reply_intent': twin(),
};

function toConfig(route: AiRoute, spec: RouteSpec): RouteConfig {
  return {
    route,
    provider: 'deepseek',
    tier: spec.tier,
    model: MODEL_IDS[spec.tier],
    caller: spec.caller,
    thinking: spec.thinking,
    effort: spec.effort,
    temperature: spec.temperature,
    maxTokens: spec.maxTokens,
    output: spec.output,
    delivery: spec.delivery,
    vision: spec.vision ?? false,
    webSearch: spec.webSearch ?? false,
    cacheLayers: spec.cacheLayers,
    fallback: undefined,
    thresholds: undefined,
  };
}

/** A decision route on Jev: the twin's request shape, the Jev model, the twin as fallback. */
function toDecisionConfig(route: DecisionRoute, twinSpec: RouteSpec): RouteConfig {
  const fallback = toConfig(route, twinSpec);
  return {
    ...fallback,
    provider: 'jev',
    tier: 'jev',
    model: JEV_MODEL,
    fallback,
    thresholds: DECISION_THRESHOLDS[route],
  };
}

export const ROUTING: Readonly<Record<AiRoute, RouteConfig>> = Object.fromEntries([
  ...Object.entries(GENERATION_SPECS).map(([route, spec]) => [
    route,
    toConfig(route as AiRoute, spec),
  ]),
  ...Object.entries(DECISION_SPECS).map(([route, spec]) => [
    route,
    toDecisionConfig(route as DecisionRoute, spec),
  ]),
]) as Record<AiRoute, RouteConfig>;

export function resolveRoute(route: AiRoute): RouteConfig {
  return ROUTING[route];
}

/**
 * The generation request config for a route: the route itself, or a decision route's fast-tier
 * twin. The gateway only ever sends this, so a decision route called through it runs its twin.
 */
export function resolveGenerationRoute(route: AiRoute): RouteConfig {
  const config = ROUTING[route];
  return config.fallback ?? config;
}
