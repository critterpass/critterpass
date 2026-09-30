/**
 * ElevenLabs text to speech for phrase cards (docs/product-decisions.md: Flash for the languages it
 * speaks, v3 for the rest, e.g. Icelandic), in the trip guide's voice. Configured only with
 * `ELEVENLABS_API_KEY`; without it no audio is recorded and the app speaks the card on device.
 */

const ENDPOINT = 'https://api.elevenlabs.io/v1/text-to-speech';

/** Languages Flash v2.5 speaks (ISO 639-1); everything else goes to v3. */
// prettier-ignore
export const FLASH_LANGUAGES: ReadonlySet<string> = new Set([
  'en', 'ja', 'zh', 'de', 'hi', 'fr', 'ko', 'pt', 'it', 'es', 'id', 'nl', 'tr', 'fil', 'pl', 'sv',
  'bg', 'ro', 'ar', 'cs', 'el', 'fi', 'hr', 'ms', 'sk', 'da', 'ta', 'uk', 'ru', 'hu', 'no', 'vi',
]);

export function ttsModel(language: string): 'eleven_flash_v2_5' | 'eleven_v3' {
  const base = language.toLowerCase().split('-')[0] ?? language;
  return FLASH_LANGUAGES.has(base) ? 'eleven_flash_v2_5' : 'eleven_v3';
}

export interface SpeechRequest {
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
          model_id: ttsModel(request.language),
          language_code: request.language.toLowerCase().split('-')[0],
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`ElevenLabs answered ${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    },
  };
}
