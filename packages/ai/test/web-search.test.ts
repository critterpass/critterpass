import type Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import {
  createGateway,
  GatewayConfigError,
  isBlockedUrl,
  resolveRoute,
  routeTools,
  screenWebSearch,
  SUPPLIER_BLOCKED_DOMAINS,
  visibleAnswer,
  webSearchTool,
} from '../src';
import { fixtureTransport } from './fixture-transport';

interface EvalCase {
  readonly description: string;
  readonly vars: { readonly route: string; readonly question: string; readonly fixture: string };
  readonly assert: readonly { readonly type: string; readonly value: readonly string[] }[];
}

const cases = parse(
  readFileSync(new URL('../evals/injection/web-search-supplier.yaml', import.meta.url), 'utf8'),
) as EvalCase[];

describe('blocked supplier domains', () => {
  it('matches domains, subdomains and blocked paths only', () => {
    expect(isBlockedUrl('https://www.agoda.com/x')).toBe(true);
    expect(isBlockedUrl('https://m.booking.com/hotel/vn')).toBe(true);
    expect(isBlockedUrl('https://www.tripadvisor.com/Hotel_Review-g298082')).toBe(true);
    expect(isBlockedUrl('https://www.tripadvisor.com/Tourism-g298082')).toBe(false);
    expect(isBlockedUrl('https://notbooking.com/')).toBe(false);
    expect(isBlockedUrl('https://hoianworldheritage.org.vn/en')).toBe(false);
    expect(isBlockedUrl('not a url')).toBe(true);
  });
});

describe('visible answer', () => {
  it('shows a text block that carries no citations field at all', () => {
    const block = {
      type: 'text',
      text: 'Pho is best at breakfast.',
    } as Anthropic.Messages.TextBlock;
    expect(visibleAnswer([block])).toBe('Pho is best at breakfast.');
  });
});

describe('web search tool config', () => {
  it('always carries the blocked list, never allowed_domains, and runs direct', () => {
    const tool = webSearchTool(resolveRoute('guest.guide'));
    expect(tool).toMatchObject({
      type: 'web_search_20260209',
      name: 'web_search',
      blocked_domains: [...SUPPLIER_BLOCKED_DOMAINS],
      allowed_callers: ['direct'],
      max_uses: 3,
    });
    expect(tool).not.toHaveProperty('allowed_domains');
  });

  it('is only offered on Sonnet routes that switch it on', () => {
    expect(
      routeTools(resolveRoute('guide.chat')).some((t) => 'name' in t && t.name === 'web_search'),
    ).toBe(false);
    expect(routeTools(resolveRoute('guest.guide')).at(-1)).toMatchObject({ name: 'web_search' });
    expect(() => webSearchTool(resolveRoute('guide.chat'))).toThrow(GatewayConfigError);
    expect(() => webSearchTool(resolveRoute('email.parse'))).toThrow(GatewayConfigError);
  });
});

describe('web search supplier eval (fixture replay)', () => {
  it('keeps its assertion list equal to the code blocklist', () => {
    for (const evalCase of cases) {
      expect(evalCase.assert[0]?.type).toBe('not-contains-any');
      expect(evalCase.assert[0]?.value).toEqual([...SUPPLIER_BLOCKED_DOMAINS]);
    }
  });

  it.each(cases)('$description', async (evalCase) => {
    const transport = fixtureTransport([evalCase.vars.fixture]);
    const gateway = createGateway({ apiKey: 'fixture-key', fetch: transport.fetch });
    const route = resolveRoute('guest.guide');
    const result = await gateway.callModel('guest.guide', {
      system: 'rules',
      messages: [{ role: 'user', content: evalCase.vars.question }],
      tools: routeTools(route),
    });

    const sentTools = (transport.requests[0]?.tools ?? []) as {
      name: string;
      blocked_domains?: string[];
    }[];
    expect(sentTools.find((t) => t.name === 'web_search')?.blocked_domains).toEqual([
      ...SUPPLIER_BLOCKED_DOMAINS,
    ]);
    expect(result.usage.webSearchRequests).toBe(1);

    const shown = visibleAnswer(result.message.content);
    for (const domain of evalCase.assert[0]?.value ?? []) expect(shown).not.toContain(domain);
    expect(shown).toContain('hoianworldheritage.org.vn');
  });

  it('detects a supplier result the provider-side block let through', async () => {
    const transport = fixtureTransport(['sonnet-web-search-supplier-leak', 'sonnet-web-search']);
    const gateway = createGateway({ apiKey: 'fixture-key', fetch: transport.fetch });
    const input = { system: 'rules', messages: [{ role: 'user' as const, content: 'hotel?' }] };
    const leaked = await gateway.callModel('guest.guide', input);
    const clean = await gateway.callModel('guest.guide', input);
    expect(screenWebSearch(leaked.message.content).blocked).toEqual([
      'https://www.agoda.com/hoi-an-old-town-homestay/hotel/hoi-an-vn.html',
    ]);
    expect(screenWebSearch(clean.message.content).blocked).toEqual([]);
  });
});
