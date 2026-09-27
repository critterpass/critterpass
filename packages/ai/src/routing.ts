/**
 * Route → model and request shape (docs/api-contracts.md §6 "Model routing"; per-task tiers from the
 * AI guide research §4.1). Haiku 4.5 is the default; Sonnet 5 is the workhorse; Opus 5.5 runs only
 * the itinerary skeleton. Swapping a model is a change to `MODEL_IDS` plus a full eval run.
 *
 * Thinking: Haiku routes run without thinking. Sonnet 5 thinks adaptively by default, so every
 * latency-bound (streamed) Sonnet route disables it explicitly; job routes keep adaptive thinking
 * with an explicit effort. Opus 5.5 thinking cannot be disabled.
 */
import type { AiCaller, AiRoute, AiTier } from '@cp/domain';

export const MODEL_IDS: Readonly<Record<AiTier, string>> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-5',
  opus: 'claude-opus-5-5',
};

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

export type Thinking = 'disabled' | 'adaptive';
export type Effort = 'low' | 'medium' | 'high';
export type Delivery = 'stream' | 'call' | 'batch';

export interface RouteConfig {
  readonly route: AiRoute;
  readonly tier: AiTier;
  readonly model: string;
  /** Tool allow-list class; `null` = no tools at all. */
  readonly caller: AiCaller | null;
  readonly thinking: Thinking;
  /** `output_config.effort`; Haiku 4.5 routes leave it unset. */
  readonly effort: Effort | undefined;
  readonly maxTokens: number;
  readonly output: 'text' | 'structured';
  readonly delivery: Delivery;
  /** Anthropic server-side web search (guest guide only). */
  readonly webSearch: boolean;
  readonly cacheLayers: readonly CacheLayer[];
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

type RouteSpec = Omit<RouteConfig, 'route' | 'model' | 'effort' | 'webSearch'> & {
  readonly effort?: Effort;
  readonly webSearch?: boolean;
};

const haiku = (
  caller: AiCaller | null,
  maxTokens: number,
  rest: Partial<Pick<RouteSpec, 'output' | 'delivery' | 'cacheLayers'>> = {},
): RouteSpec => ({
  tier: 'haiku',
  caller,
  thinking: 'disabled',
  maxTokens,
  output: rest.output ?? 'text',
  delivery: rest.delivery ?? 'call',
  cacheLayers: rest.cacheLayers ?? PLAIN_LAYERS,
});

const sonnet = (
  caller: AiCaller | null,
  maxTokens: number,
  effort: Effort,
  rest: Partial<Pick<RouteSpec, 'output' | 'delivery' | 'cacheLayers' | 'webSearch'>> = {},
): RouteSpec => {
  const delivery = rest.delivery ?? 'call';
  return {
    tier: 'sonnet',
    caller,
    // Streamed routes are latency-bound: adaptive thinking would delay the first token.
    thinking: delivery === 'stream' ? 'disabled' : 'adaptive',
    effort,
    maxTokens,
    output: rest.output ?? 'text',
    delivery,
    cacheLayers: rest.cacheLayers ?? JOB_LAYERS,
    webSearch: rest.webSearch ?? false,
  };
};

const SPECS: Readonly<Record<AiRoute, RouteSpec>> = {
  'guide.chat': haiku('C', 1024, { delivery: 'stream', cacheLayers: GUIDE_LAYERS }),
  'guide.voice': haiku('C', 512, { delivery: 'stream', cacheLayers: GUIDE_LAYERS }),
  'guide.crew_mention': haiku('G', 1024, { delivery: 'stream', cacheLayers: GUIDE_LAYERS }),
  'guide.chime_in_classifier': haiku(null, 64, { output: 'structured' }),
  'help.intent_classifier': haiku(null, 64, { output: 'structured' }),
  'quests.generate': haiku('B', 4096, {
    output: 'structured',
    delivery: 'batch',
    cacheLayers: JOB_LAYERS,
  }),
  'roundup.evening': haiku('B', 512, { cacheLayers: JOB_LAYERS }),
  'email.parse': haiku('M', 2048, { output: 'structured' }),
  'idea.duplicate_tiebreak': haiku(null, 64, { output: 'structured' }),
  'must_do.fit_line': haiku(null, 128),
  'micro.line': haiku(null, 128),
  'guide.chat_escalation': sonnet('C', 2048, 'low', {
    delivery: 'stream',
    cacheLayers: GUIDE_LAYERS,
  }),
  'pitch.place': sonnet(null, 1024, 'low', { delivery: 'stream' }),
  'draft.day': sonnet('D', 8192, 'low', { output: 'structured' }),
  'draft.repair': sonnet('D', 4096, 'low', { output: 'structured' }),
  'redraft.day': sonnet('D', 8192, 'medium', { output: 'structured' }),
  'proposal.personal': sonnet('D', 2048, 'low', { output: 'structured' }),
  'briefing.daily': sonnet('B', 2048, 'low', { output: 'structured' }),
  'disruption.plan_b': sonnet('R', 4096, 'low', { output: 'structured' }),
  'recap.narration': sonnet('B', 8192, 'medium', { output: 'structured' }),
  'photo.picks': sonnet(null, 2048, 'low', { output: 'structured', cacheLayers: PLAIN_LAYERS }),
  'notification.templates': sonnet(null, 8192, 'low', {
    output: 'structured',
    delivery: 'batch',
    cacheLayers: ['global_rules', 'persona'],
  }),
  'content.factory': sonnet(null, 8192, 'low', {
    output: 'structured',
    delivery: 'batch',
    cacheLayers: ['global_rules', 'persona', 'destination'],
  }),
  'receipt.parse': sonnet('M', 4096, 'low', { output: 'structured', cacheLayers: PLAIN_LAYERS }),
  'menu.parse': sonnet('M', 4096, 'low', {
    output: 'structured',
    delivery: 'stream',
    cacheLayers: PLAIN_LAYERS,
  }),
  'email.parse_fallback': sonnet('M', 4096, 'low', {
    output: 'structured',
    cacheLayers: PLAIN_LAYERS,
  }),
  'guest.guide': sonnet('C', 2048, 'low', {
    delivery: 'stream',
    webSearch: true,
    cacheLayers: GUIDE_LAYERS,
  }),
  'draft.skeleton': {
    tier: 'opus',
    caller: 'D',
    thinking: 'adaptive',
    effort: 'medium',
    maxTokens: 16_000,
    output: 'structured',
    delivery: 'call',
    cacheLayers: JOB_LAYERS,
  },
};

function toConfig(route: AiRoute, spec: RouteSpec): RouteConfig {
  return {
    route,
    tier: spec.tier,
    model: MODEL_IDS[spec.tier],
    caller: spec.caller,
    thinking: spec.thinking,
    effort: spec.effort,
    maxTokens: spec.maxTokens,
    output: spec.output,
    delivery: spec.delivery,
    webSearch: spec.webSearch ?? false,
    cacheLayers: spec.cacheLayers,
  };
}

export const ROUTING: Readonly<Record<AiRoute, RouteConfig>> = Object.fromEntries(
  Object.entries(SPECS).map(([route, spec]) => [route, toConfig(route as AiRoute, spec)]),
) as Record<AiRoute, RouteConfig>;

export function resolveRoute(route: AiRoute): RouteConfig {
  return ROUTING[route];
}
