/**
 * The Home tip line against a recorded DeepSeek reply (only `fetch` swapped): a grounded reply is
 * kept, and the number grounding catches a price, day or month the facts do not hold, falling
 * back to the deterministic template, as do a failed call and a reply that spans lines.
 */
import { describe, expect, it } from 'vitest';

import { createGateway } from '../src/client';
import {
  phraseTip,
  templateTip,
  ungroundedTokens,
  validateTipLine,
  type TipFact,
} from '../src/prompts/tips/prompt';
import { fixtureTransport } from './fixture-transport';

const PLACE = '0199a0f2-7c1e-7d4b-9a53-2f3c1d0e9b11';

const blossoms: TipFact = {
  kind: 'season_peak',
  place_id: PLACE,
  place: 'Kyoto',
  value_minor: null,
  currency: null,
  date: '2027-04-03',
  origin: null,
  event: 'Cherry blossoms',
};
const bookBy: TipFact = {
  kind: 'book_by',
  place_id: PLACE,
  place: 'Kyoto',
  value_minor: 41_200,
  currency: 'USD',
  date: '2027-02-01',
  origin: 'SIN',
  origin_city: 'Singapore',
};

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

describe('validateTipLine', () => {
  it('accepts prices, days, months and years that are in the facts', () => {
    const line = "Kyoto's blossoms peak around April 3; book the $412 flight by February 1.";
    expect(validateTipLine(line, [blossoms, bookBy])).toBe(line);
    expect(ungroundedTokens('Flights are $412.00 in 2027.', [bookBy])).toEqual([]);
  });

  it('rejects any number or month the facts do not hold', () => {
    expect(ungroundedTokens('Flights drop to $399 by February 1.', [bookBy])).toEqual(['399']);
    expect(ungroundedTokens('Blossoms peak around April 5.', [blossoms])).toEqual(['5']);
    expect(ungroundedTokens('Blossoms peak in March.', [blossoms])).toEqual(['March']);
    expect(validateTipLine('Book by February 1.\nOr not.', [bookBy])).toBeNull();
    expect(validateTipLine('x'.repeat(121), [bookBy])).toBeNull();
  });

  it('reads lower-case "may" as a verb, not the month', () => {
    expect(ungroundedTokens('You may want to book by February 1.', [bookBy])).toEqual([]);
    expect(ungroundedTokens('Go in May.', [bookBy])).toEqual(['May']);
  });
});

describe('phraseTip', () => {
  it('keeps a recorded grounded reply', async () => {
    const transport = fixtureTransport(['tips-01']);
    const gateway = createGateway({ apiKey: 'test', fetch: transport.fetch });
    const result = await phraseTip(gateway, { guide: 'pon', facts: [blossoms, bookBy] });
    expect(result.source).toBe('model');
    expect(result.line).toContain('Kyoto');
    expect(ungroundedTokens(result.line, [blossoms, bookBy])).toEqual([]);
  });

  it('replaces a reply with an unsupported number by the template', async () => {
    const result = await phraseTip(gatewayReplying('Flights to Kyoto are only $299 right now!'), {
      guide: 'pon',
      facts: [bookBy],
    });
    expect(result).toEqual(templateTip({ guide: 'pon', facts: [bookBy] }));
    expect(result.line).toBe('Fares to Kyoto are climbing. Book by February 1 for $412.');
  });

  it('falls back to the template when the call fails', async () => {
    const result = await phraseTip(gatewayReplying(null), {
      guide: 'pon',
      facts: [blossoms, bookBy],
    });
    expect(result.source).toBe('template');
    expect(result.line).toBe(
      'Kyoto: Cherry blossoms around April 3. Fares to Kyoto are climbing. Book by February 1 for $412.',
    );
    expect(ungroundedTokens(result.line, [blossoms, bookBy])).toEqual([]);
  });
});
