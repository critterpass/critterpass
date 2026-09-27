import { AI_ROUTES, DECISION_ROUTES, DECISION_THRESHOLDS, type AiRoute } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import {
  buildMessageParams,
  GatewayConfigError,
  GUIDE_TEMPERATURE,
  JEV_MODEL,
  MODEL_IDS,
  structuredInstruction,
  VISION_TIERS,
  resolveGenerationRoute,
  resolveRoute,
  ROUTING,
} from '../src';

const USER_TURN = [{ role: 'user' as const, content: 'hi' }];

describe('routing table', () => {
  it.each(AI_ROUTES)('resolves %s to a pinned model of its tier', (route) => {
    const config = resolveRoute(route);
    expect(config.route).toBe(route);
    expect(config.model).toBe(MODEL_IDS[config.tier]);
    expect(config.maxTokens).toBeGreaterThan(0);
    expect(config.cacheLayers[0]).toBeDefined();
  });

  it('covers exactly the domain route list', () => {
    expect(Object.keys(ROUTING).sort()).toEqual([...AI_ROUTES].sort());
  });

  it('runs generation on the two DeepSeek tiers, by explicit model id', () => {
    expect(MODEL_IDS).toEqual({
      fast: 'deepseek-flash',
      pro: 'deepseek-v4-pro',
      jev: 'jev-1.13.0',
    });
    for (const route of AI_ROUTES) {
      expect(Object.values(MODEL_IDS), route).toContain(resolveRoute(route).model);
      expect(resolveRoute(route).model, route).not.toMatch(/claude|haiku|sonnet|opus/u);
    }
  });

  it('keeps chat, voice, quests, parsing and photo work on the fast tier', () => {
    const fast: AiRoute[] = [
      'guide.chat',
      'guide.voice',
      'guide.crew_mention',
      'quests.generate',
      'email.parse',
      'receipt.parse',
      'menu.parse',
      'photo.picks',
    ];
    for (const route of fast) expect(resolveRoute(route).tier, route).toBe('fast');
  });

  it('plans, redrafts and builds the skeleton on the pro tier', () => {
    const pro: AiRoute[] = [
      'draft.skeleton',
      'draft.day',
      'redraft.day',
      'proposal.personal',
      'disruption.plan_b',
      'guest.guide',
    ];
    for (const route of pro) expect(resolveRoute(route).tier, route).toBe('pro');
  });

  it('reads images only on a vision tier', () => {
    for (const route of AI_ROUTES) {
      const config = resolveRoute(route);
      if (config.vision) expect(VISION_TIERS.has(config.tier), route).toBe(true);
    }
    expect(AI_ROUTES.filter((route) => resolveRoute(route).vision).sort()).toEqual([
      'menu.parse',
      'photo.picks',
      'receipt.parse',
    ]);
  });

  it('never thinks on a streamed or fast route, and states effort wherever it thinks', () => {
    for (const route of AI_ROUTES) {
      const config = resolveRoute(route);
      if (config.delivery === 'stream' || config.tier === 'fast') {
        expect(config.thinking, route).toBe('disabled');
      }
      if (config.thinking === 'enabled') {
        expect(config.effort, route).toBeDefined();
        expect(config.temperature, route).toBeUndefined();
      }
    }
  });

  it('gives parsers structured output and no tool class beyond M', () => {
    for (const route of ['email.parse', 'receipt.parse', 'menu.parse'] as const) {
      expect(resolveRoute(route)).toMatchObject({ caller: 'M', output: 'structured' });
    }
  });

  it('runs only decision routes on Jev, pinned, each with a fast-tier twin and thresholds', () => {
    const onJev = AI_ROUTES.filter((route) => resolveRoute(route).provider === 'jev');
    expect(onJev.sort()).toEqual([...DECISION_ROUTES].sort());
    for (const route of DECISION_ROUTES) {
      const config = resolveRoute(route);
      expect(config).toMatchObject({ tier: 'jev', model: JEV_MODEL, caller: null });
      expect(config.model).toBe('jev-1.13.0');
      expect(config.fallback).toMatchObject({
        route,
        provider: 'deepseek',
        tier: 'fast',
        caller: null,
        output: 'structured',
        delivery: 'call',
      });
      expect(config.thresholds).toBe(DECISION_THRESHOLDS[route]);
      expect(resolveGenerationRoute(route)).toBe(config.fallback);
    }
  });

  it('keeps every generation route on DeepSeek with no fallback', () => {
    const decisions = new Set<AiRoute>(DECISION_ROUTES);
    for (const route of AI_ROUTES.filter((r) => !decisions.has(r))) {
      const config = resolveRoute(route);
      expect(config.provider, route).toBe('deepseek');
      expect(config.tier, route).not.toBe('jev');
      expect(config.fallback, route).toBeUndefined();
      expect(resolveGenerationRoute(route)).toBe(config);
    }
  });

  it('enables web search only on the guest guide', () => {
    const withSearch = AI_ROUTES.filter((route) => resolveRoute(route).webSearch);
    expect(withSearch).toEqual(['guest.guide']);
  });
});

describe('buildMessageParams', () => {
  it('rejects a tool choice the provider would not honour', () => {
    const skeleton = resolveRoute('draft.skeleton');
    const chat = resolveRoute('guide.chat');
    const any = { type: 'any' as const };
    const forced = { type: 'tool' as const, name: 'x' };
    // `any` is never enforced; a forced tool is rejected with thinking on.
    expect(() => buildMessageParams(chat, { messages: USER_TURN, toolChoice: any })).toThrow(
      GatewayConfigError,
    );
    expect(() => buildMessageParams(skeleton, { messages: USER_TURN, toolChoice: forced })).toThrow(
      GatewayConfigError,
    );
    expect(
      buildMessageParams(chat, { messages: USER_TURN, toolChoice: forced }).tool_choice,
    ).toEqual(forced);
    expect(
      buildMessageParams(skeleton, { messages: USER_TURN, toolChoice: { type: 'auto' } })
        .tool_choice,
    ).toEqual({ type: 'auto' });
  });

  it('sends temperature only without thinking, with the guide default on guide routes', () => {
    expect(
      buildMessageParams(resolveRoute('guide.chat'), { messages: USER_TURN }).temperature,
    ).toBe(GUIDE_TEMPERATURE);
    const input = { messages: USER_TURN, temperature: 0 };
    expect(buildMessageParams(resolveRoute('micro.line'), input).temperature).toBe(0);
    expect(buildMessageParams(resolveRoute('draft.skeleton'), input)).not.toHaveProperty(
      'temperature',
    );
  });

  it('sends explicit thinking, with effort only when thinking', () => {
    const skeleton = buildMessageParams(resolveRoute('draft.skeleton'), { messages: USER_TURN });
    expect(skeleton).toMatchObject({
      model: 'deepseek-v4-pro',
      thinking: { type: 'enabled' },
      output_config: { effort: 'high' },
    });
    const chat = buildMessageParams(resolveRoute('guide.chat'), { messages: USER_TURN });
    expect(chat).toMatchObject({ model: MODEL_IDS.fast, thinking: { type: 'disabled' } });
    expect(chat).not.toHaveProperty('output_config');
    const escalation = buildMessageParams(resolveRoute('guide.chat_escalation'), {
      messages: USER_TURN,
    });
    expect(escalation).toMatchObject({ model: MODEL_IDS.pro, thinking: { type: 'disabled' } });
    expect(escalation).not.toHaveProperty('output_config');
  });

  it('refuses tools on a route without a tool allow-list', () => {
    const tools = [{ name: 'places_search', input_schema: { type: 'object' as const } }];
    expect(() =>
      buildMessageParams(resolveRoute('micro.line'), { messages: USER_TURN, tools }),
    ).toThrow(GatewayConfigError);
  });

  it('turns a structured output format into a system instruction carrying the schema', () => {
    const schema = { type: 'object', properties: { total_minor: { type: 'integer' } } };
    const params = buildMessageParams(resolveRoute('receipt.parse'), {
      system: 'Read receipts.',
      messages: USER_TURN,
      outputFormat: { type: 'json_schema', schema },
    });
    expect(params).not.toHaveProperty('output_config');
    expect(params.system).toEqual([
      { type: 'text', text: 'Read receipts.' },
      { type: 'text', text: structuredInstruction({ type: 'json_schema', schema }) },
    ]);
    expect(JSON.stringify(params.system)).toContain('total_minor');
  });
});
