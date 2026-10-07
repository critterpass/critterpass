import { describe, expect, it } from 'vitest';

import {
  acceptTaggedLine,
  buildGuideChatRequest,
  createVoiceTagStripper,
  resolvePersonaPack,
  stripVoiceTags,
  tagRecapNarration,
  voiceTagsIn,
} from '../src';

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

/** What the screen gets from `pieces` streamed one by one, and the pieces as they came out. */
function streamed(pieces: readonly string[]) {
  const stripper = createVoiceTagStripper();
  const shown = [...pieces.map((piece) => stripper.push(piece)), stripper.flush()];
  return { shown, text: shown.join('') };
}

describe('voice tags in a streamed reply', () => {
  it('never shows half a tag that is split across pieces', () => {
    const { shown, text } = streamed([
      'Chào cả nhà! [exc',
      'ited] Hôm nay ',
      'trời đẹp. [chu',
      'ck',
      'les] Đi thôi!',
    ]);
    expect(text).toBe('Chào cả nhà! Hôm nay trời đẹp. Đi thôi!');
    expect(shown.some((piece) => piece.includes('[') || piece.includes(']'))).toBe(false);
    // One character at a time is the worst split there is.
    const tagged = '[warmly] Xin chào [laughs]. Mai gặp ở Hội An [softly] nhé!';
    const single = streamed([...tagged]);
    expect(single.text).toBe('Xin chào. Mai gặp ở Hội An nhé!');
    expect(single.shown.some((piece) => piece.includes('['))).toBe(false);
  });

  it('shows every other bracket as written, whole or split', () => {
    expect(streamed(['The sign says "teh [s', 'ic] beach" [laughs] really.']).text).toBe(
      'The sign says "teh [sic] beach" really.',
    );
    expect(streamed(['Bus [12] or [[excited] the [excitedly] one']).text).toBe(
      'Bus [12] or [ the [excitedly] one',
    );
    // A reply that ends inside a bracket keeps it.
    expect(streamed(['See the list [exc']).text).toBe('See the list [exc');
  });

  it('leaves text without tags exactly as it came', () => {
    const pieces = ['Line one.\n\n', '- 08:30  pier\n', '- 09:15 market  '];
    expect(streamed(pieces).text).toBe(pieces.join(''));
  });
});

describe('the guide chat prompt', () => {
  const base = {
    pack: resolvePersonaPack('tokek'),
    tripContext: undefined,
    history: [],
    question: 'Mai mưa không?',
    directives: { chattiness: 'normal', locale: 'vi' },
  } as const;

  it('offers audio tags only for a reply that is spoken', () => {
    expect(JSON.stringify(buildGuideChatRequest(base))).not.toContain('[chuckles]');
    const spoken = JSON.stringify(buildGuideChatRequest({ ...base, spoken: true }).messages);
    expect(spoken).toContain('[chuckles]');
    expect(spoken).toContain('at most 2');
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
