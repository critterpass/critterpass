/**
 * ElevenLabs text to speech for recorded audio (phrase cards, recap narration): Eleven v4 for
 * every language, in the trip guide's voice. Configured only with `ELEVENLABS_API_KEY`; without it
 * no audio is recorded and the app speaks the card on device.
 */

const ENDPOINT = 'https://api.elevenlabs.io/v1/text-to-speech';

/** The recorded-audio model: highest quality, every language the app ships in. */
export const TTS_MODEL = 'eleven_v4';

/** Eleven v4 takes at most this many characters in one request. */
export const TTS_MAX_CHARS = 10_000;

export interface SpeechRequest {
  /** What is read; square-bracket audio tags (`[excited]`) steer the delivery and are not spoken. */
  readonly text: string;
  readonly language: string;
  readonly voiceId: string;
}

export interface TtsProvider {
  /** MP3 audio of `text` read in `voiceId`. */
  synthesize(request: SpeechRequest): Promise<Uint8Array>;
}

export interface ElevenLabsOptions {
  readonly apiKey: string;
  /** Network boundary override (recorded fixtures in tests). */
  readonly fetch?: typeof fetch;
}

export function createElevenLabs(options: ElevenLabsOptions): TtsProvider {
  const send = options.fetch ?? fetch;
  return {
    async synthesize(request) {
      if (request.text.length > TTS_MAX_CHARS) {
        throw new Error(`text of ${request.text.length} characters is over the model's limit`);
      }
      const url = `${ENDPOINT}/${encodeURIComponent(request.voiceId)}?output_format=mp3_44100_128`;
      const response = await send(url, {
        method: 'POST',
        headers: {
          'xi-api-key': options.apiKey,
          'content-type': 'application/json',
          accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: request.text,
          model_id: TTS_MODEL,
          language_code: request.language.toLowerCase().split('-')[0],
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`ElevenLabs answered ${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    },
  };
}
