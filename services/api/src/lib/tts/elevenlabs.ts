/**
 * ElevenLabs text-to-speech for spoken guide replies: Flash v2.5 (lowest latency) in the
 * languages it speaks, v3 for the rest, one owned voice per guide (`guides.voice_id`). Each piece
 * of the reply is one streaming request; the audio comes back as MP3 bytes as they are made.
 */

export const FLASH_MODEL = 'eleven_flash_v2_5';
export const FALLBACK_MODEL = 'eleven_v3';
const API = 'https://api.elevenlabs.io/v1/text-to-speech';
const OUTPUT_FORMAT = 'mp3_44100_128';

/** ISO 639-1 languages Flash v2.5 speaks (ElevenLabs model docs). */
const FLASH_LANGUAGES: ReadonlySet<string> = new Set([
  'en',
  'ja',
  'zh',
  'de',
  'hi',
  'fr',
  'ko',
  'pt',
  'it',
  'es',
  'id',
  'nl',
  'tr',
  'fil',
  'pl',
  'sv',
  'bg',
  'ro',
  'ar',
  'cs',
  'el',
  'fi',
  'hr',
  'ms',
  'sk',
  'da',
  'ta',
  'uk',
  'ru',
  'hu',
  'no',
  'vi',
]);

export function modelFor(language: string): string {
  const base = language.toLowerCase().split(/[-_]/u)[0] ?? '';
  return FLASH_LANGUAGES.has(base) ? FLASH_MODEL : FALLBACK_MODEL;
}

export interface SpeakRequest {
  readonly voiceId: string;
  readonly text: string;
  /** BCP 47 tag of the reply; picks the model and pins its language. */
  readonly language: string;
  /** The piece spoken before this one, so the intonation carries across pieces. */
  readonly previousText?: string;
}

export class TtsError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'TtsError';
    this.status = status;
  }
}

export type Synthesize = (request: SpeakRequest, signal?: AbortSignal) => AsyncIterable<Uint8Array>;

export function elevenLabsSynthesizer(apiKey: string, fetchImpl: typeof fetch = fetch): Synthesize {
  return async function* synthesize(request, signal) {
    const model = modelFor(request.language);
    const language = request.language.toLowerCase().split(/[-_]/u)[0];
    const response = await fetchImpl(
      `${API}/${encodeURIComponent(request.voiceId)}/stream?output_format=${OUTPUT_FORMAT}`,
      {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
        body: JSON.stringify({
          text: request.text,
          model_id: model,
          ...(model === FLASH_MODEL && language ? { language_code: language } : {}),
          ...(request.previousText ? { previous_text: request.previousText } : {}),
        }),
        ...(signal ? { signal } : {}),
      },
    );
    if (!response.ok || response.body === null) {
      throw new TtsError(response.status, `ElevenLabs answered HTTP ${response.status}`);
    }
    const reader = response.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        if (value.byteLength > 0) yield value;
      }
    } finally {
      reader.releaseLock();
    }
  };
}
