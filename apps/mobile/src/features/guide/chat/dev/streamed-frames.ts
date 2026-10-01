/**
 * Streamed guide answers as the server sends them, for the guide lab: token frames, a tool call
 * between parts, then `done`. The places answer is the recorded DeepSeek stream from
 * packages/ai/test/fixtures/deepseek (flash-stream-tool-use, then flash-stream-after-tool), with the
 * break the runner puts where the tool call split it. The Vietnamese list is written in the same
 * shape: an intro line ending in a colon, then list items, each after a tool call.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { GuideFrame } from '../data/guide-frames';

const token = (text: string): GuideFrame => ({ type: 'token', data: { text } });

function answerFrames(
  parts: readonly (readonly string[])[],
  status: 'ok' | 'unavailable',
): readonly GuideFrame[] {
  return [
    ...parts.flatMap((tokens, index) => [
      ...(index === 0
        ? []
        : [
            { type: 'tool_start', data: { tool: 'places_search', id: `call_${index}` } },
            {
              type: 'tool_result',
              data: { id: `call_${index}`, card: { tool: 'places_search', status } },
            },
          ]),
      ...tokens.map(token),
    ]),
    { type: 'done', data: { ai_generated: true, sources: [] } },
  ];
}

export const PLACES_QUESTION = 'Noodles near us?';

export const PLACES_FRAMES = answerFrames(
  [
    [
      'Let',
      ' me',
      ' check',
      ' what',
      "'s",
      ' near',
      ' the',
      ' villa',
      ' and',
      ' still',
      ' open',
      '.',
    ],
    [
      '\n\nI',
      ' can',
      "'t",
      ' check',
      ' what',
      "'s",
      ' open',
      ' right',
      ' now',
      ' —',
      ' that',
      ' lookup',
      ' is',
      ' down',
      ' on',
      ' my',
      ' end',
      '.',
      ' Want',
      ' me',
      ' to',
      ' try',
      ' again',
      ' in',
      ' a',
      ' few',
      ' minutes',
      ',',
      ' or',
      ' take',
      ' a',
      ' wander',
      ' down',
      ' the',
      ' lane',
      ' by',
      ' the',
      ' villa',
      ' and',
      ' see',
      ' what',
      "'s",
      ' lit',
      ' up',
      '?',
    ],
  ],
  'unavailable',
);

export const LIST_QUESTION = 'Tối nay ăn gì gần villa?';

export const LIST_FRAMES = answerFrames(
  [
    ['Để mình', ' xem', ' quanh', ' villa', ' còn', ' quán', ' nào', ' mở', ' tới', ' khuya:'],
    ['\n- Warung', ' Biah', ' Biah', ', 5', ' phút', ' đi', ' bộ'],
    ['\n- Nasi', ' Ayam', ' Kedewatan', ', mở', ' tới', ' 22:00'],
    ['\n\nMuốn', ' mình', ' đặt', ' bàn', ' không?'],
  ],
  'ok',
);
