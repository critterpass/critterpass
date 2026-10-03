import { switchedOffError } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import {
  buildGeminiBody,
  computeCostMicros,
  createGeminiVision,
  extractPlaceMentionsFromMedia,
  GatewayError,
  LINK_EXTRACT_FORMAT,
  parseGeminiResponse,
  youtubeWatchUrl,
  type GeminiRequest,
} from '../../src';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

const request: GeminiRequest = {
  system: 'List the places.',
  text: 'The trip is to Bali, Indonesia.',
  media: { kind: 'image', mimeType: 'image/png', data: PNG },
  outputFormat: LINK_EXTRACT_FORMAT,
  maxOutputTokens: 2048,
};

/** A transport that fails the test if anything reaches the network. */
const noNetwork: typeof fetch = () => Promise.reject(new Error('no request may leave'));

describe('createGeminiVision', () => {
  it('sends nothing while ai.gemini_vision is off', async () => {
    let asked = 0;
    const gemini = createGeminiVision({
      apiKey: 'key',
      fetch: noNetwork,
      enabled: () => Promise.resolve(false),
      assertRouteOn: () => {
        asked += 1;
        return Promise.resolve();
      },
    });
    const error = await gemini.call('links.extract_places', request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GatewayError);
    expect((error as GatewayError).detail).toMatchObject({
      reason: 'switched_off',
      key: 'ai.gemini_vision',
    });
    expect(asked).toBe(0);
  });

  it('sends nothing when the route or the gemini tier is switched off', async () => {
    const gemini = createGeminiVision({
      apiKey: 'key',
      fetch: noNetwork,
      enabled: () => Promise.resolve(true),
      assertRouteOn: () => Promise.reject(switchedOffError('ai.tier.gemini.enabled')),
    });
    await expect(gemini.call('links.extract_places', request)).rejects.toMatchObject({
      code: 'AI_UNAVAILABLE',
      retryable: false,
    });
  });

  it('finds no mentions, and makes no call, for a screenshot while the flag is off', async () => {
    const gemini = createGeminiVision({
      apiKey: 'key',
      fetch: noNetwork,
      enabled: () => Promise.resolve(false),
    });
    const result = await extractPlaceMentionsFromMedia(gemini, {
      media: { kind: 'video', url: 'https://youtu.be/dQw4w9WgXcQ' },
      destination: 'Bali, Indonesia',
      areas: [],
    });
    expect(result).toEqual({ status: 'none', mentions: [], reason: 'call_failed' });
  });
});

describe('buildGeminiBody', () => {
  it('sends a screenshot inline with the reply schema and a JSON response type', () => {
    const body = buildGeminiBody(request) as {
      system_instruction: { parts: { text: string }[] };
      contents: { parts: Record<string, unknown>[] }[];
      generation_config: Record<string, unknown>;
    };
    expect(body.contents[0]?.parts[0]).toEqual({
      inline_data: { mime_type: 'image/png', data: Buffer.from(PNG).toString('base64') },
    });
    expect(body.system_instruction.parts[0]?.text).toContain('"mentions"');
    expect(body.generation_config).toEqual({
      temperature: 0,
      max_output_tokens: 2048,
      response_mime_type: 'application/json',
    });
  });

  it('sends a public YouTube video by its canonical URL, at low resolution', () => {
    const body = buildGeminiBody({
      ...request,
      media: { kind: 'video', url: 'https://www.youtube.com/shorts/dQw4w9WgXcQ' },
    }) as { contents: { parts: Record<string, unknown>[] }[]; generation_config: object };
    expect(body.contents[0]?.parts[0]).toEqual({
      file_data: { file_uri: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    });
    expect(body.generation_config).toMatchObject({ media_resolution: 'MEDIA_RESOLUTION_LOW' });
  });

  it('refuses anything that is not a public YouTube video, before any request', () => {
    expect(youtubeWatchUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
    for (const url of [
      'http://youtu.be/dQw4w9WgXcQ',
      'https://www.tiktok.com/@a/video/1',
      'https://www.youtube.com/watch?v=short',
      'https://evil.example/youtube.com/watch?v=dQw4w9WgXcQ',
    ]) {
      expect(youtubeWatchUrl(url)).toBeNull();
    }
    expect(() =>
      buildGeminiBody({ ...request, media: { kind: 'video', url: 'https://vimeo.com/1' } }),
    ).toThrow(GatewayError);
  });
});

describe('parseGeminiResponse', () => {
  // The documented generateContent response shape (ai.google.dev/api/generate-content).
  const answer = {
    candidates: [
      {
        content: {
          role: 'model',
          parts: [
            { text: 'Looking at the list…', thought: true },
            { text: '{"destination":"this","mentions":[]}' },
          ],
        },
        finishReason: 'STOP',
      },
    ],
    usageMetadata: {
      promptTokenCount: 1300,
      cachedContentTokenCount: 300,
      candidatesTokenCount: 40,
      thoughtsTokenCount: 60,
      totalTokenCount: 1400,
    },
  };

  it('reads the answer without its thoughts and bills thinking as output', () => {
    expect(parseGeminiResponse(answer)).toEqual({
      text: '{"destination":"this","mentions":[]}',
      usage: { inputTokens: 1000, cacheWriteTokens: 0, cacheReadTokens: 300, outputTokens: 100 },
      refused: false,
      finishReason: 'STOP',
    });
  });

  it('reads a safety stop, a blocked prompt and the decline marker as refusals', () => {
    const safety = { candidates: [{ content: { parts: [] }, finishReason: 'SAFETY' }] };
    const blocked = { promptFeedback: { blockReason: 'PROHIBITED_CONTENT' } };
    const declined = { candidates: [{ content: { parts: [{ text: '[[decline]]' }] } }] };
    for (const body of [safety, blocked, declined]) {
      expect(parseGeminiResponse(body).refused).toBe(true);
    }
  });

  it('prices gemini at the launch rate, then the 2027 rate', () => {
    const usage = {
      inputTokens: 1_000_000,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      outputTokens: 0,
    };
    expect(computeCostMicros('gemini', usage, new Date('2026-12-31T23:00:00Z'))).toBe(750_000);
    expect(computeCostMicros('gemini', usage, new Date('2027-01-01T00:00:00Z'))).toBe(1_500_000);
  });
});
