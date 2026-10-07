import { describe, expect, it } from 'vitest';

import { acceptTaggedLine, stripVoiceTags, tagRecapNarration, voiceTagsIn } from '../src';

const LINE = 'Đà Nẵng, 3 ngày: cả nhóm đã ký con dấu, và Chà Vá vẫn trốn ở Sơn Trà.';
const TAGGED =
  '[warmly] Đà Nẵng, 3 ngày: cả nhóm đã ký con dấu, [chuckles] và Chà Vá vẫn trốn ở Sơn Trà.';

const replying = (reply: unknown) => ({
  callModel: () =>
    Promise.resolve({
      message: { content: [{ type: 'text', text: JSON.stringify(reply) }] },
    }) as never,
});

describe('voice tags', () => {
  it('strips tags wherever they sit and leaves the words as they were', () => {
    expect(stripVoiceTags(TAGGED)).toBe(LINE);
    expect(stripVoiceTags('Nothing got away [sighs]. Next time [laughs]!')).toBe(
      'Nothing got away. Next time!',
    );
    expect(stripVoiceTags('Greetings.[softly] From Huế [whispers]')).toBe('Greetings. From Huế');
    expect(voiceTagsIn(TAGGED)).toEqual(['warmly', 'chuckles']);
  });

  it('strips any short bracket, so it is kept away from lines with brackets of their own', () => {
    expect(stripVoiceTags('They wrote "teh [sic] beach".')).toBe('They wrote "teh beach".');
    expect(
      acceptTaggedLine('The sign said [sic] beach.', '[warmly] The sign said [sic] beach.'),
    ).toBe(null);
  });

  it('accepts a line only when taking the tags out gives the original back', () => {
    expect(acceptTaggedLine(LINE, TAGGED)).toBe(TAGGED);
    // A dropped diacritic, a changed number, an added word, new emphasis.
    expect(acceptTaggedLine(LINE, TAGGED.replace('Đà Nẵng', 'Da Nang'))).toBe(null);
    expect(acceptTaggedLine(LINE, TAGGED.replace('3 ngày', 'ba ngày'))).toBe(null);
    expect(acceptTaggedLine(LINE, `${TAGGED} Tuyệt vời!`)).toBe(null);
    expect(acceptTaggedLine(LINE, TAGGED.replace('Sơn Trà.', 'Sơn Trà!'))).toBe(null);
  });

  it('refuses tags outside the list, too many of them, and none at all', () => {
    expect(acceptTaggedLine('The crew signed.', '[gunshot] The crew signed.')).toBe(null);
    expect(acceptTaggedLine('The crew signed.', '[and they all cheered] The crew signed.')).toBe(
      null,
    );
    expect(
      acceptTaggedLine('The crew signed.', '[warmly] The [softly] crew [gently] signed [sighs].'),
    ).toBe(null);
    expect(acceptTaggedLine('The crew signed.', 'The crew signed.')).toBe(null);
  });
});

describe('recap narration tagging', () => {
  const lines = [
    { card: 'cover', text: LINE },
    { card: 'stamp', text: 'Đà Nẵng is stamped on your pass.' },
  ];

  it('returns the tagged lines and leaves out the one the model reworded', async () => {
    const tagged = await tagRecapNarration(
      replying({
        lines: [
          { card: 'cover', text: TAGGED },
          { card: 'stamp', text: '[proudly] Da Nang is stamped on your pass!' },
          { card: 'postcard', text: '[warmly] A card nobody asked for.' },
        ],
      }),
      lines,
    );
    expect(tagged).toEqual({ cover: TAGGED });
  });

  it('sends the tag list and the lines as data', async () => {
    const requests: unknown[] = [];
    await tagRecapNarration(
      {
        callModel: (route, input) => {
          requests.push({ route, input });
          return Promise.reject(new Error('unused'));
        },
      },
      lines,
    );
    const sent = JSON.stringify(requests[0]);
    expect(sent).toContain('recap.narration');
    expect(sent).toContain('[chuckles]');
    expect(sent).toContain('Chà Vá');
  });

  it('tags nothing when the call fails or the reply is not JSON', async () => {
    expect(
      await tagRecapNarration({ callModel: () => Promise.reject(new Error('down')) }, lines),
    ).toEqual({});
    expect(await tagRecapNarration(replying('sure!'), lines)).toEqual({});
  });
});
