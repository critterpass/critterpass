import { AI_ROUTES, type AiRoute } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { buildMessageParams, GatewayConfigError, MODEL_IDS, resolveRoute, ROUTING } from '../src';

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

  it('uses Opus only for the itinerary skeleton', () => {
    const opus = AI_ROUTES.filter((route) => resolveRoute(route).tier === 'opus');
    expect(opus).toEqual(['draft.skeleton']);
  });

  it('keeps chat, voice, quests and parsing on Haiku', () => {
    const haiku: AiRoute[] = ['guide.chat', 'guide.voice', 'quests.generate', 'email.parse'];
    for (const route of haiku) expect(resolveRoute(route).tier).toBe('haiku');
  });

  it('never leaves Sonnet streaming routes on adaptive thinking', () => {
    for (const route of AI_ROUTES) {
      const config = resolveRoute(route);
      if (config.tier === 'sonnet' && config.delivery === 'stream') {
        expect(config.thinking, route).toBe('disabled');
        expect(config.effort, route).toBeDefined();
      }
    }
  });

  it('gives parsers structured output and no tool class beyond M', () => {
    for (const route of ['email.parse', 'receipt.parse', 'menu.parse'] as const) {
      expect(resolveRoute(route)).toMatchObject({ caller: 'M', output: 'structured' });
    }
  });

  it('enables web search only on the guest guide', () => {
    const withSearch = AI_ROUTES.filter((route) => resolveRoute(route).webSearch);
    expect(withSearch).toEqual(['guest.guide']);
  });
});

describe('buildMessageParams', () => {
  it('rejects a forced tool choice on the Opus route', () => {
    const route = resolveRoute('draft.skeleton');
    for (const toolChoice of [{ type: 'any' as const }, { type: 'tool' as const, name: 'x' }]) {
      expect(() => buildMessageParams(route, { messages: USER_TURN, toolChoice })).toThrow(
        GatewayConfigError,
      );
    }
    expect(
      buildMessageParams(route, { messages: USER_TURN, toolChoice: { type: 'auto' } }).tool_choice,
    ).toEqual({ type: 'auto' });
  });

  it('strips temperature on Sonnet and Opus but keeps it on Haiku', () => {
    const input = { messages: USER_TURN, temperature: 0.7 };
    expect(buildMessageParams(resolveRoute('pitch.place'), input)).not.toHaveProperty(
      'temperature',
    );
    expect(buildMessageParams(resolveRoute('draft.skeleton'), input)).not.toHaveProperty(
      'temperature',
    );
    expect(buildMessageParams(resolveRoute('guide.chat'), input).temperature).toBe(0.7);
  });

  it('sends explicit thinking and effort per route', () => {
    const skeleton = buildMessageParams(resolveRoute('draft.skeleton'), { messages: USER_TURN });
    expect(skeleton).toMatchObject({
      model: 'claude-opus-5-5',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
    });
    const chat = buildMessageParams(resolveRoute('guide.chat'), { messages: USER_TURN });
    expect(chat).toMatchObject({ model: MODEL_IDS.haiku, thinking: { type: 'disabled' } });
    expect(chat).not.toHaveProperty('output_config');
    const pitch = buildMessageParams(resolveRoute('pitch.place'), { messages: USER_TURN });
    expect(pitch).toMatchObject({
      thinking: { type: 'disabled' },
      output_config: { effort: 'low' },
    });
  });

  it('refuses tools on a route without a tool allow-list', () => {
    const tools = [{ name: 'places_search', input_schema: { type: 'object' as const } }];
    expect(() =>
      buildMessageParams(resolveRoute('micro.line'), { messages: USER_TURN, tools }),
    ).toThrow(GatewayConfigError);
  });

  it('passes a structured output format through output_config', () => {
    const format = { type: 'json_schema' as const, schema: { type: 'object' } };
    const params = buildMessageParams(resolveRoute('receipt.parse'), {
      messages: USER_TURN,
      outputFormat: format,
    });
    expect(params.output_config).toEqual({ effort: 'low', format });
  });
});
