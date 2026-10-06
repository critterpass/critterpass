import { describe, expect, it } from '@jest/globals';

import {
  deepgramListenUrl,
  openDeepgramStream,
  type SocketLike,
  type SttToken,
} from '../src/deepgram';
import session from './fixtures/deepgram-live-vi.json';

/**
 * The websocket is the network boundary: this stand-in replays a Nova-3 live session written in
 * Deepgram's documented message format (fixtures/deepgram-live-vi.json).
 */
class ReplaySocket implements SocketLike {
  binaryType = 'blob';
  readyState = 0;
  onopen: SocketLike['onopen'] = null;
  onmessage: SocketLike['onmessage'] = null;
  onerror: SocketLike['onerror'] = null;
  onclose: SocketLike['onclose'] = null;
  readonly sent: (string | ArrayBuffer)[] = [];
  readonly url: string;
  readonly protocols: string[];
  closed: { code: number | undefined; reason: string | undefined } | null = null;

  constructor(url: string, protocols: string[]) {
    this.url = url;
    this.protocols = protocols;
  }

  open() {
    this.readyState = 1;
    this.onopen?.({});
  }

  receive(messages: readonly unknown[]) {
    for (const message of messages) this.onmessage?.({ data: JSON.stringify(message) });
  }

  send(data: string | ArrayBuffer) {
    this.sent.push(data);
  }

  close(code?: number, reason?: string) {
    this.closed = { code, reason };
    this.readyState = 3;
  }

  get controls(): string[] {
    return this.sent.filter((d): d is string => typeof d === 'string');
  }

  get audio(): ArrayBuffer[] {
    return this.sent.filter((d): d is ArrayBuffer => typeof d !== 'string');
  }
}

const token: SttToken = {
  token: 'grant-jwt',
  scheme: 'bearer',
  expires_at: '2026-10-06T05:13:44Z',
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function harness(getToken: () => Promise<SttToken> = () => Promise.resolve(token)) {
  const sockets: ReplaySocket[] = [];
  const partials: string[] = [];
  const errors: string[] = [];
  let speechStarts = 0;
  const stream = openDeepgramStream({
    language: session.language,
    getToken,
    onPartial: (text) => partials.push(text),
    onSpeechStart: () => {
      speechStarts += 1;
    },
    onError: (code) => errors.push(code),
    createSocket: (url, protocols) => {
      const socket = new ReplaySocket(url, protocols);
      sockets.push(socket);
      return socket;
    },
    finishTimeoutMs: 200,
  });
  return { stream, sockets, partials, errors, speechStarts: () => speechStarts };
}

describe('deepgram live transcription', () => {
  it('asks Nova-3 for interim 16 kHz linear PCM results in the spoken language', () => {
    const url = new URL(deepgramListenUrl('vi'));
    expect(url.origin + url.pathname).toBe('wss://api.deepgram.com/v1/listen');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      model: 'nova-3',
      language: 'vi',
      encoding: 'linear16',
      sample_rate: '16000',
      channels: '1',
      interim_results: 'true',
    });
  });

  it('authenticates with the short-lived token and streams frames held before the socket opened', async () => {
    const { stream, sockets } = harness();
    stream.send(btoa('\u0001\u0002'));
    await flush();
    const socket = sockets[0]!;
    expect(socket.protocols).toEqual(['bearer', 'grant-jwt']);
    expect(socket.binaryType).toBe('arraybuffer');
    stream.send(btoa('\u0003\u0004'));
    expect(socket.audio).toHaveLength(0);
    socket.open();
    stream.send(btoa('\u0005\u0006'));
    expect(socket.audio.map((frame) => [...new Uint8Array(frame)])).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
    ]);
  });

  it('reports partials and resolves the finalized utterance of a live session', async () => {
    const { stream, sockets, partials, speechStarts } = harness();
    await flush();
    const socket = sockets[0]!;
    socket.open();
    socket.receive(session.server);
    const final = stream.finish();
    expect(socket.controls).toContain(JSON.stringify({ type: 'Finalize' }));
    socket.receive(session.afterFinalize);
    await expect(final).resolves.toBe(session.expected.final);
    expect(partials).toEqual(session.expected.partials);
    expect(speechStarts()).toBe(1);
    expect(socket.controls.at(-1)).toBe(JSON.stringify({ type: 'CloseStream' }));
    expect(socket.closed?.code).toBe(1000);
  });

  it('answers with what it heard when the finalized result never comes', async () => {
    const { stream, sockets } = harness();
    await flush();
    const socket = sockets[0]!;
    socket.open();
    socket.receive(session.server);
    await expect(stream.finish()).resolves.toBe('Cho tôi hỏi quán phở gần đây');
  });

  it('reports a token failure without opening a socket', async () => {
    const { sockets, errors } = harness(() => Promise.reject(new Error('RATE_LIMITED')));
    await flush();
    expect(sockets).toHaveLength(0);
    expect(errors).toEqual(['token']);
  });

  it('reports an abnormal close, and a cancelled stream stays silent', async () => {
    const { stream, sockets, errors, partials } = harness();
    await flush();
    const socket = sockets[0]!;
    socket.open();
    socket.onclose?.({ code: 1011, reason: 'NET-0001' });
    expect(errors).toEqual(['closed']);

    const second = harness();
    await flush();
    const other = second.sockets[0]!;
    other.open();
    second.stream.cancel();
    other.receive(session.server);
    expect(second.partials).toEqual([]);
    expect(partials).toEqual([]);
    expect(stream).toBeDefined();
  });
});
