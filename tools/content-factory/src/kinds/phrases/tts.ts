/**
 * Phrase audio: ElevenLabs (Eleven v4) reads each card in a native voice per language and
 * the MP3 is stored in R2 under a content-hash key, so an unchanged card is never synthesised twice.
 * Without an ElevenLabs key the cards stay text-only with `audio_status: pending`; running the
 * stage again once the key is set fills them in.
 */
import { createHash } from 'node:crypto';

import type { ContentItem } from '@cp/content';
import { AwsClient } from 'aws4fetch';

export const TTS_MODEL = 'eleven_v4';

export interface TtsConfig {
  readonly apiKey: string;
  /** Voice id per language (`TTS_VOICES` JSON); languages without one stay pending. */
  readonly voices: Readonly<Record<string, string>>;
  readonly r2: { endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string };
}

export function ttsConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): TtsConfig | null {
  const apiKey = env['ELEVENLABS_API_KEY'];
  const endpoint = env['R2_S3_ENDPOINT'];
  const bucket = env['R2_BUCKET'];
  const accessKeyId = env['R2_ACCESS_KEY_ID'];
  const secretAccessKey = env['R2_SECRET_ACCESS_KEY'];
  if (!apiKey || !endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    apiKey,
    voices: JSON.parse(env['TTS_VOICES'] ?? '{}') as Record<string, string>,
    r2: { endpoint, bucket, accessKeyId, secretAccessKey },
  };
}

/** R2 key of a card's audio: changes whenever the text, language or voice changes. */
export function audioKey(
  card: Pick<ContentItem<'phrases'>, 'language' | 'text'>,
  voiceId: string,
): string {
  const hash = createHash('sha256')
    .update(`${TTS_MODEL}\n${voiceId}\n${card.language}\n${card.text}`)
    .digest('hex');
  return `content/audio/phrases/${hash}.mp3`;
}

export async function synthesise(
  cards: readonly ContentItem<'phrases'>[],
  config: TtsConfig | null,
  send: typeof fetch = fetch,
): Promise<ContentItem<'phrases'>[]> {
  if (config === null) return [...cards];
  const r2 = new AwsClient({
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey,
    service: 's3',
  });
  const out: ContentItem<'phrases'>[] = [];
  for (const card of cards) {
    const voice = config.voices[card.language];
    if (voice === undefined) {
      out.push(card);
      continue;
    }
    const key = audioKey(card, voice);
    const objectUrl = `${config.r2.endpoint}/${config.r2.bucket}/${key}`;
    const exists = await r2.fetch(objectUrl, { method: 'HEAD' });
    if (!exists.ok) {
      const speech = await send(
        `https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_64`,
        {
          method: 'POST',
          headers: { 'xi-api-key': config.apiKey, 'content-type': 'application/json' },
          body: JSON.stringify({ text: card.text, model_id: TTS_MODEL }),
        },
      );
      if (!speech.ok) throw new Error(`text-to-speech failed with ${speech.status} for ${card.id}`);
      const put = await r2.fetch(objectUrl, {
        method: 'PUT',
        headers: { 'content-type': 'audio/mpeg' },
        body: await speech.arrayBuffer(),
      });
      if (!put.ok) throw new Error(`R2 upload failed with ${put.status} for ${card.id}`);
    }
    out.push({ ...card, audio_key: key, audio_status: 'ready' });
  }
  return out;
}
