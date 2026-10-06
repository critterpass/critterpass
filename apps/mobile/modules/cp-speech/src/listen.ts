import type { ListenEngine, SpeechEvents } from './CpSpeechModule';
import {
  openDeepgramStream,
  type DeepgramErrorCode,
  type SocketFactory,
  type SttToken,
} from './deepgram';

/** What listening needs from the speech module (the native binding satisfies it). */
export interface ListenPort {
  start(locale: string, engine: ListenEngine): Promise<void>;
  stop(): Promise<void>;
  isOnDeviceSupported(locale: string): Promise<boolean>;
  addListener<E extends 'onPartial' | 'onFinal' | 'onAudio'>(
    event: E,
    listener: SpeechEvents[E],
  ): { remove(): void };
}

export interface ListenOptions {
  /** BCP 47 tag of what the user speaks. */
  readonly locale: string;
  /** `POST /v1/stt/token`, called only when the device cannot transcribe the locale itself. */
  readonly getToken: () => Promise<SttToken>;
  readonly onPartial: (text: string) => void;
  readonly onError?: (code: DeepgramErrorCode, detail: string) => void;
  /** Forces an engine; by default on-device wherever the platform has the locale. */
  readonly engine?: ListenEngine;
  readonly createSocket?: SocketFactory;
  /** How long `stop()` waits for the final text before answering with the last partial. */
  readonly finalTimeoutMs?: number;
}

export interface Listening {
  readonly engine: ListenEngine;
  /** Ends the utterance and resolves with its whole text. */
  stop(): Promise<string>;
  /** Drops the utterance (barge-in of a new turn, leaving the screen). */
  cancel(): Promise<void>;
}

export async function startListening(port: ListenPort, options: ListenOptions): Promise<Listening> {
  const engine =
    options.engine ?? ((await port.isOnDeviceSupported(options.locale)) ? 'device' : 'stream');
  const subscriptions: { remove(): void }[] = [];
  const release = () => subscriptions.splice(0).forEach((s) => s.remove());
  let latest = '';
  let cancelled = false;
  const partial = (text: string) => {
    if (cancelled) return;
    latest = text;
    options.onPartial(text);
  };

  if (engine === 'stream') {
    const stream = openDeepgramStream({
      language: options.locale,
      getToken: options.getToken,
      onPartial: partial,
      ...(options.onError ? { onError: options.onError } : {}),
      ...(options.createSocket ? { createSocket: options.createSocket } : {}),
    });
    subscriptions.push(port.addListener('onAudio', (event) => stream.send(event.pcm)));
    await port.start(options.locale, 'stream');
    return {
      engine,
      async stop() {
        await port.stop();
        release();
        return stream.finish();
      },
      async cancel() {
        cancelled = true;
        release();
        stream.cancel();
        await port.stop();
      },
    };
  }

  let resolveFinal: ((text: string) => void) | null = null;
  let finalText: string | null = null;
  subscriptions.push(port.addListener('onPartial', (event) => partial(event.text)));
  subscriptions.push(
    port.addListener('onFinal', (event) => {
      finalText = event.text;
      resolveFinal?.(event.text);
    }),
  );
  await port.start(options.locale, 'device');
  return {
    engine,
    async stop() {
      const final = new Promise<string>((resolve) => {
        if (finalText !== null) return resolve(finalText);
        resolveFinal = resolve;
        setTimeout(() => resolve(latest), options.finalTimeoutMs ?? 2_000);
      });
      await port.stop();
      const text = await final;
      release();
      return text;
    },
    async cancel() {
      cancelled = true;
      release();
      await port.stop();
    },
  };
}
