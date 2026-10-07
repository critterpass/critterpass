/**
 * What reaches ElevenLabs for a Vietnamese line: the words exactly as written (every diacritic,
 * no folding to ASCII), the language named so the model reads them as Vietnamese, and the model
 * that speaks it. The vendor is doubled at `fetch`.
 */
import { describe, expect, it } from 'vitest';

import { createElevenLabs, ttsModel } from '../../src/jobs/guide/elevenlabs';

const LINE = 'Đà Nẵng, ba ngày: cả nhóm đã ký con dấu, và Chà Vá vẫn trốn ở Sơn Trà.';

describe('ElevenLabs speech request', () => {
  it('sends a Vietnamese line intact, with its language and the model that speaks it', async () => {
    const sent: { url: string; body: Uint8Array; headers: Record<string, string> }[] = [];
    const tts = createElevenLabs({
      apiKey: 'test-key',
      fetch: ((url: string, init: RequestInit) => {
        sent.push({
          url,
          body: new TextEncoder().encode(init.body as string),
          headers: init.headers as Record<string, string>,
        });
        return Promise.resolve(new Response(new Uint8Array([1, 2, 3])));
      }) as unknown as typeof fetch,
    });
    const audio = await tts.synthesize({ text: LINE, language: 'vi-VN', voiceId: 'voice-1' });

    expect([...audio]).toEqual([1, 2, 3]);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toContain('/v1/text-to-speech/voice-1');
    expect(sent[0]?.headers['content-type']).toBe('application/json');
    // The bytes on the wire decode, as UTF-8, to the same line.
    const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(sent[0]?.body)) as {
      text: string;
      model_id: string;
      language_code: string;
    };
    expect(body.text).toBe(LINE);
    expect(body.text.normalize('NFC')).toBe(LINE.normalize('NFC'));
    expect(body.language_code).toBe('vi');
    expect(body.model_id).toBe('eleven_flash_v2_5');
  });

  it('reads a language Flash does not speak with v3', () => {
    expect(ttsModel('vi')).toBe('eleven_flash_v2_5');
    expect(ttsModel('is')).toBe('eleven_v3');
  });
});
