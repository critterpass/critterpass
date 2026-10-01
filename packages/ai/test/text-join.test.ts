import { describe, expect, it } from 'vitest';

import {
  buildSystemBlocks,
  createGateway,
  createToolRegistry,
  REPO_PACKS,
  runTurn,
  type MeterHandle,
} from '../src';
import { textJoiner } from '../src/runner/text-join';
import { fixtureTransport } from './fixture-transport';

/** Streams `parts` (each a list of tokens) with a tool call between parts, as the runner does. */
function stream(parts: readonly (readonly string[])[]): string {
  const joiner = textJoiner();
  let out = '';
  parts.forEach((tokens, index) => {
    if (index > 0) joiner.toolCall();
    for (const token of tokens) out += joiner.token(token);
  });
  return out;
}

describe('textJoiner', () => {
  it('starts a new paragraph after a sentence end', () => {
    expect(
      stream([
        ['Here is the', ' answer.'],
        ['The', ' forecast', ' is dry.'],
      ]),
    ).toBe('Here is the answer.\n\nThe forecast is dry.');
  });

  it('keeps a list going on its own line', () => {
    expect(
      stream([
        ['Two picks:\n', '- Fushimi', ' Inari'],
        ['- Nishiki', ' Market'],
      ]),
    ).toBe('Two picks:\n- Fushimi Inari\n- Nishiki Market');
    expect(stream([['1. Temple'], ['2. Market']])).toBe('1. Temple\n2. Market');
  });

  it('puts a list under the line that introduces it', () => {
    expect(stream([['Open late:'], ['- Nishiki Market']])).toBe('Open late:\n- Nishiki Market');
  });

  it('breaks Vietnamese text without touching its diacritics', () => {
    expect(
      stream([
        ['Để mình', ' xem', ' thời tiết.'],
        ['Dự báo', ' ngày', ' mai', ' nắng.'],
      ]),
    ).toBe('Để mình xem thời tiết.\n\nDự báo ngày mai nắng.');
    expect(stream([['Gợi ý:'], ['- Chùa', ' Thiên Mụ']])).toBe('Gợi ý:\n- Chùa Thiên Mụ');
  });

  it('adds nothing where the text already has a space or a break', () => {
    expect(stream([['Checking.'], [' Done.']])).toBe('Checking. Done.');
    expect(stream([['Checking.\n'], ['Done.']])).toBe('Checking.\nDone.');
  });

  it('joins tokens verbatim when no tool call came between them', () => {
    expect(stream([['still', ' open.', 'I', "'ll"]])).toBe("still open.I'll");
  });

  it('adds nothing before the first text, and waits past empty tokens', () => {
    expect(stream([[], ['The forecast']])).toBe('The forecast');
    expect(stream([['Done.'], ['', 'Next.']])).toBe('Done.\n\nNext.');
  });
});

const UNMETERED: MeterHandle = {
  reservation: { metered: false, fairUse: 'ok', usage: null },
  commit: () => Promise.resolve({ usage: null }),
  release: () => Promise.resolve({ usage: null }),
};

describe('runTurn text across a tool call', () => {
  it('streams the recorded answer with a paragraph break where the tool call was', async () => {
    const transport = fixtureTransport(['flash-stream-tool-use', 'flash-stream-after-tool']);
    const gateway = createGateway({
      apiKey: 'fixture-key',
      fetch: transport.fetch,
      maxAttempts: 1,
    });
    let text = '';
    for await (const event of runTurn(
      {
        route: 'guide.chat',
        system: buildSystemBlocks({ pack: REPO_PACKS.tokek }),
        messages: [{ role: 'user', content: "What's open near the villa?" }],
        tool: { uid: '0190f0a0-0000-7000-8000-00000000d001', tripId: null, caller: 'C' },
      },
      { gateway, registry: createToolRegistry(), meter: UNMETERED },
    )) {
      if (event.type === 'token') text += event.text;
    }
    expect(text).toContain("still open.\n\nI can't check");
    expect(text).not.toMatch(/\.[A-Z]/u);
  });
});
