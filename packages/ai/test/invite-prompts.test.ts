/**
 * Invite tags and the crew welcome line against recorded DeepSeek replies (only `fetch` swapped):
 * valid replies pass through, and the code-side validators catch deliberate slips (a tag outside
 * the taxonomy, a line with a phone number, a reply that is not JSON, a failed call) with the
 * template fallback.
 */
import { describe, expect, it } from 'vitest';

import { createGateway } from '../src/client';
import {
  buildCrewWelcomeRequest,
  templateCrewWelcome,
  validateCrewWelcome,
  writeCrewWelcome,
} from '../src/prompts/crew-welcome/prompt';
import {
  buildInviteTagsRequest,
  inferInviteTags,
  templateTags,
} from '../src/prompts/invite-tags/prompt';
import { validateInviteTags } from '../src/prompts/invite-tags/schema';
import { fixtureTransport } from './fixture-transport';

function gatewayReplying(text: string | null) {
  return createGateway({
    apiKey: 'test',
    maxAttempts: 1,
    fetch: () =>
      text === null
        ? Promise.resolve(new Response('{"error":{"type":"api_error"}}', { status: 500 }))
        : Promise.resolve(
            new Response(
              JSON.stringify({
                id: 'msg_test',
                type: 'message',
                role: 'assistant',
                model: 'deepseek-flash',
                content: [{ type: 'text', text }],
                stop_reason: 'end_turn',
                stop_sequence: null,
                usage: { input_tokens: 1, output_tokens: 1 },
              }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            ),
          ),
  });
}

const tags = {
  note: 'loves night markets, hates early starts',
  inviteeName: 'Dev',
  guide: 'tokek' as const,
};

describe('invite tags', () => {
  it('keeps a recorded reply that stays inside the taxonomy', async () => {
    const transport = fixtureTransport(['invite-tags-01']);
    const gateway = createGateway({ apiKey: 'test', fetch: transport.fetch });
    const result = await inferInviteTags(gateway, {
      note: 'loves night markets and street food',
      inviteeName: 'Dev',
      guide: 'tokek',
    });
    expect(result.source).toBe('model');
    expect(result.tags.length).toBeGreaterThan(0);
    expect(result.line.length).toBeLessThanOrEqual(70);
  });

  it('sends the note only as untrusted data, with the taxonomy as the output schema', () => {
    const request = buildInviteTagsRequest(tags);
    const turn = JSON.stringify(request.messages);
    expect(turn).toContain('untrusted_data');
    expect(turn).toContain('night markets');
    expect(JSON.stringify(request.outputFormat)).toContain('street_food');
  });

  it('rejects a tag outside the taxonomy and answers with the keyword template', async () => {
    const result = await inferInviteTags(
      gatewayReplying('{"tags":["party_mode"],"line":"Dev is a legend."}'),
      tags,
    );
    expect(result).toMatchObject({ source: 'template', tags: ['markets'] });
    expect(validateInviteTags({ tags: ['beach', 'yachts'], line: 'x' })).toBeNull();
  });

  it('keeps valid tags but swaps a line carrying contact details for the template line', async () => {
    const result = await inferInviteTags(
      gatewayReplying('{"tags":["markets"],"line":"Ring Dev on 0412345678 first."}'),
      tags,
    );
    expect(result).toMatchObject({ source: 'model', tags: ['markets'] });
    expect(result.line).not.toMatch(/\d{5}/u);
  });

  it('falls back when the call fails or the reply is not JSON', async () => {
    expect((await inferInviteTags(gatewayReplying(null), tags)).source).toBe('template');
    expect((await inferInviteTags(gatewayReplying('beach, markets'), tags)).source).toBe(
      'template',
    );
  });

  it('never tags what the note says the friend avoids', () => {
    expect(templateTags('not into bars or nightlife, but loves the beach')).toEqual(['beach']);
    expect(templateTags('coffee, museums, markets, temples and hiking')).toHaveLength(3);
  });
});

describe('crew welcome', () => {
  const input = {
    newcomer: 'Dev Patel',
    crewName: 'Bali Bandits',
    members: 4,
    guide: 'tokek' as const,
  };

  it('keeps a recorded line that greets the newcomer by first name', async () => {
    const transport = fixtureTransport(['crew-welcome-01']);
    const gateway = createGateway({ apiKey: 'test', fetch: transport.fetch });
    const result = await writeCrewWelcome(gateway, input);
    expect(result.source).toBe('model');
    expect(result.line).toContain('Dev');
  });

  it('passes names as data and falls back on a long, multi-line or failed reply', async () => {
    expect(JSON.stringify(buildCrewWelcomeRequest(input).messages)).toContain('untrusted_data');
    expect(validateCrewWelcome('"Welcome, Dev!"')).toBe('Welcome, Dev!');
    expect(validateCrewWelcome(`Welcome, Dev! ${'so '.repeat(40)}`)).toBeNull();
    expect(validateCrewWelcome('Welcome,\nDev')).toBeNull();
    expect((await writeCrewWelcome(gatewayReplying(null), input)).line).toBe(
      templateCrewWelcome(input).line,
    );
    expect(templateCrewWelcome(input).line).toBe(
      'Welcome aboard, Dev. Bali Bandits is 4 strong now.',
    );
  });
});
