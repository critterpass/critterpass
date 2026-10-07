/**
 * ElevenLabs text-to-speech for spoken guide replies: Eleven v4 Turbo (the real-time model) for
 * every language, one owned voice per guide (`guides.voice_id`). Each piece of the reply is one
 * streaming request; the audio comes back as MP3 bytes as they are made.
 */

export const TTS_MODEL = 'eleven_v4_turbo';
const API = 'https://api.elevenlabs.io/v1/text-to-speech';
const OUTPUT_FORMAT = 'mp3_44100_128';

export interface SpeakRequest {
  readonly voiceId: string;
  readonly text: string;
  /** BCP 47 tag of the reply; pins the language the model reads it in. */
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
    const language = request.language.toLowerCase().split(/[-_]/u)[0];
    const response = await fetchImpl(
      `${API}/${encodeURIComponent(request.voiceId)}/stream?output_format=${OUTPUT_FORMAT}`,
      {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
        body: JSON.stringify({
          text: request.text,
          model_id: TTS_MODEL,
          ...(language ? { language_code: language } : {}),
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
