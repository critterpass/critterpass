/**
 * Deepgram Nova-3 live transcription over a websocket, for Android and for iOS locales without an
 * on-device model. The socket opens with a short-lived credential from `POST /v1/stt/token` (never
 * the account key), streams the native module's 16 kHz PCM frames, reports interim text as
 * partials and resolves `finish()` with the whole utterance once Deepgram has finalized it.
 */

/**
 * The `POST /v1/stt/token` answer. `scheme` is the websocket subprotocol Deepgram expects: `bearer`
 * for a token grant, `token` for a scoped API key.
 */
export interface SttToken {
  readonly token: string;
  readonly scheme: 'token' | 'bearer';
  readonly expires_at: string;
}

/** The slice of the WHATWG WebSocket this client uses (React Native's global matches it). */
export interface SocketLike {
  binaryType: string;
  readonly readyState: number;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: { readonly code: number; readonly reason: string }) => void) | null;
  send(data: string | ArrayBuffer): void;
  close(code?: number, reason?: string): void;
}

export type SocketFactory = (url: string, protocols: string[]) => SocketLike;

export type DeepgramErrorCode = 'token' | 'network' | 'closed';

export interface DeepgramOptions {
  /** BCP 47 tag of what the user speaks, e.g. `vi`, `id`, `en-US`. */
  readonly language: string;
  readonly getToken: () => Promise<SttToken>;
  readonly onPartial: (text: string) => void;
  readonly onSpeechStart?: () => void;
  readonly onError?: (code: DeepgramErrorCode, detail: string) => void;
  readonly createSocket?: SocketFactory;
  readonly sampleRate?: number;
  /** How long `finish()` waits for the finalized result before answering with what it has. */
  readonly finishTimeoutMs?: number;
}

export interface DeepgramStream {
  /** Queues one base64 PCM frame; frames sent before the socket opens are held, in order. */
  send(pcmBase64: string): void;
  /** Ends the utterance and resolves with its whole text. */
  finish(): Promise<string>;
  /** Drops the utterance and closes the socket. */
  cancel(): void;
}

const OPEN = 1;
const ENDPOINT = 'wss://api.deepgram.com/v1/listen';

export function deepgramListenUrl(language: string, sampleRate = 16_000): string {
  const params = new URLSearchParams({
    model: 'nova-3',
    language,
    encoding: 'linear16',
    sample_rate: String(sampleRate),
    channels: '1',
    interim_results: 'true',
    smart_format: 'true',
    punctuate: 'true',
    vad_events: 'true',
    endpointing: '300',
  });
  return `${ENDPOINT}?${params.toString()}`;
}

interface ResultsMessage {
  readonly type: 'Results';
  readonly is_final?: boolean;
  readonly from_finalize?: boolean;
  readonly channel?: { readonly alternatives?: readonly { readonly transcript?: string }[] };
}

function parse(data: unknown): { readonly type?: string } | null {
  if (typeof data !== 'string') return null;
  try {
    const value: unknown = JSON.parse(data);
    return typeof value === 'object' && value !== null ? value : null;
  } catch {
    return null;
  }
}

function join(head: string, tail: string): string {
  const left = head.trim();
  const right = tail.trim();
  if (!left) return right;
  if (!right) return left;
  return `${left} ${right}`;
}

export function base64ToBytes(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

const defaultSocket: SocketFactory = (url, protocols) =>
  new WebSocket(url, protocols) as unknown as SocketLike;

export function openDeepgramStream(options: DeepgramOptions): DeepgramStream {
  const createSocket = options.createSocket ?? defaultSocket;
  const held: ArrayBuffer[] = [];
  let socket: SocketLike | null = null;
  let committed = '';
  let interim = '';
  let lastPartial = '';
  let done = false;
  let settle: ((text: string) => void) | null = null;
  let finishing: Promise<string> | null = null;
  let finishTimer: ReturnType<typeof setTimeout> | null = null;

  const text = () => join(committed, interim);

  const close = () => {
    if (socket && socket.readyState === OPEN) {
      socket.send(JSON.stringify({ type: 'CloseStream' }));
      socket.close(1000, 'done');
    }
  };

  const resolveFinish = () => {
    const resolve = settle;
    settle = null;
    if (finishTimer) clearTimeout(finishTimer);
    finishTimer = null;
    if (!resolve) return;
    done = true;
    committed = text();
    interim = '';
    close();
    resolve(committed);
  };

  const fail = (code: DeepgramErrorCode, detail: string) => {
    if (done) return;
    if (settle) {
      resolveFinish();
      return;
    }
    done = true;
    options.onError?.(code, detail);
  };

  const onResults = (message: ResultsMessage) => {
    if (done) return;
    const transcript = message.channel?.alternatives?.[0]?.transcript ?? '';
    if (message.is_final) {
      committed = join(committed, transcript);
      interim = '';
    } else {
      interim = transcript;
    }
    const partial = text();
    if (partial !== lastPartial) {
      lastPartial = partial;
      options.onPartial(partial);
    }
    if (message.from_finalize) resolveFinish();
  };

  const connect = (token: SttToken) => {
    if (done) return;
    const ws = createSocket(deepgramListenUrl(options.language, options.sampleRate), [
      token.scheme,
      token.token,
    ]);
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      for (const frame of held.splice(0)) ws.send(frame);
      if (settle) ws.send(JSON.stringify({ type: 'Finalize' }));
    };
    ws.onmessage = (event) => {
      const message = parse(event.data);
      if (message?.type === 'Results') onResults(message as ResultsMessage);
      else if (message?.type === 'SpeechStarted') options.onSpeechStart?.();
    };
    ws.onerror = () => fail('network', 'websocket error');
    ws.onclose = (event) => {
      if (event.code !== 1000) fail('closed', `${event.code} ${event.reason}`);
      else if (settle) resolveFinish();
    };
    socket = ws;
  };

  options.getToken().then(connect, (error: unknown) => {
    fail('token', error instanceof Error ? error.message : String(error));
  });

  return {
    send(pcmBase64) {
      if (done || finishing) return;
      const frame = base64ToBytes(pcmBase64);
      if (socket?.readyState === OPEN) socket.send(frame);
      else held.push(frame);
    },
    finish() {
      if (finishing) return finishing;
      if (done) return Promise.resolve(committed);
      finishing = new Promise<string>((resolve) => {
        settle = resolve;
        if (socket?.readyState === OPEN) socket.send(JSON.stringify({ type: 'Finalize' }));
        finishTimer = setTimeout(resolveFinish, options.finishTimeoutMs ?? 2_500);
      });
      return finishing;
    },
    cancel() {
      done = true;
      settle = null;
      if (finishTimer) clearTimeout(finishTimer);
      held.length = 0;
      close();
    },
  };
}
