import { afterEach, describe, expect, it } from 'vitest';

import { DEEPSEEK_ANTHROPIC_URL, createGateway, loadDecisionEnv, loadGatewayEnv } from '../src';
import { fixtureTransport } from './fixture-transport';

const USER_TURN = [{ role: 'user' as const, content: 'hi' }];
const ambient = process.env['ANTHROPIC_BASE_URL'];

afterEach(() => {
  if (ambient === undefined) delete process.env['ANTHROPIC_BASE_URL'];
  else process.env['ANTHROPIC_BASE_URL'] = ambient;
});

describe('gateway endpoint', () => {
  it("talks to DeepSeek's Anthropic-format API when no base URL is configured, ignoring the ambient env", async () => {
    process.env['ANTHROPIC_BASE_URL'] = 'https://compatible.example.test/anthropic';
    const transport = fixtureTransport(['flash-basic']);
    const gateway = createGateway({ apiKey: 'fixture-key', fetch: transport.fetch });
    await gateway.callModel('guide.chat', { messages: USER_TURN });
    expect(transport.urls).toEqual([`${DEEPSEEK_ANTHROPIC_URL}/v1/messages`]);
  });

  it('uses an explicitly configured base URL', async () => {
    const transport = fixtureTransport(['flash-basic']);
    const gateway = createGateway({
      ...loadGatewayEnv({
        ANTHROPIC_API_KEY: 'fixture-key',
        ANTHROPIC_BASE_URL: 'https://compatible.example.test/anthropic',
      }),
      fetch: transport.fetch,
    });
    await gateway.callModel('guide.chat', { messages: USER_TURN });
    expect(transport.urls).toEqual(['https://compatible.example.test/anthropic/v1/messages']);
  });
});

describe('loadGatewayEnv', () => {
  it('treats an empty base URL as unset', () => {
    expect(loadGatewayEnv({ ANTHROPIC_API_KEY: 'k', ANTHROPIC_BASE_URL: '' })).toEqual({
      apiKey: 'k',
    });
  });

  it('rejects a missing key and a malformed base URL without echoing values', () => {
    expect(() => loadGatewayEnv({})).toThrow(/ANTHROPIC_API_KEY/);
    const attempt = () =>
      loadGatewayEnv({ ANTHROPIC_API_KEY: 'secret-value', ANTHROPIC_BASE_URL: 'not a url' });
    expect(attempt).toThrow(/ANTHROPIC_BASE_URL/);
    expect(attempt).not.toThrow(/secret-value/);
  });
});

describe('loadDecisionEnv', () => {
  it('reads the Jev key and treats an empty one as unset', () => {
    expect(loadDecisionEnv({ TYPESAFE_API_KEY: 'k' })).toEqual({ apiKey: 'k' });
    expect(loadDecisionEnv({ TYPESAFE_API_KEY: '' })).toEqual({ apiKey: undefined });
    expect(loadDecisionEnv({})).toEqual({ apiKey: undefined });
  });

  it('accepts the key in the gateway schema without echoing it', () => {
    expect(() =>
      loadGatewayEnv({ ANTHROPIC_API_KEY: 'k', TYPESAFE_API_KEY: 'secret-value' }),
    ).not.toThrow();
  });
});
