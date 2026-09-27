import { afterEach, describe, expect, it } from 'vitest';

import { ANTHROPIC_API_URL, createGateway, loadGatewayEnv } from '../src';
import { fixtureTransport } from './fixture-transport';

const USER_TURN = [{ role: 'user' as const, content: 'hi' }];
const ambient = process.env['ANTHROPIC_BASE_URL'];

afterEach(() => {
  if (ambient === undefined) delete process.env['ANTHROPIC_BASE_URL'];
  else process.env['ANTHROPIC_BASE_URL'] = ambient;
});

describe('gateway endpoint', () => {
  it("talks to Anthropic's API when no base URL is configured, ignoring the ambient env", async () => {
    process.env['ANTHROPIC_BASE_URL'] = 'https://compatible.example.test/anthropic';
    const transport = fixtureTransport(['haiku-basic']);
    const gateway = createGateway({ apiKey: 'fixture-key', fetch: transport.fetch });
    await gateway.callModel('guide.chat', { messages: USER_TURN });
    expect(transport.urls).toEqual([`${ANTHROPIC_API_URL}/v1/messages`]);
  });

  it('uses an explicitly configured base URL', async () => {
    const transport = fixtureTransport(['haiku-basic']);
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
