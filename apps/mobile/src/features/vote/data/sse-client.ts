/**
 * A small Server-Sent Events reader over a streaming `fetch` (Expo's on device): posts the body,
 * then hands each `event:`/`data:` frame to `onFrame` as it arrives. Heartbeat comments are
 * skipped. Resolves when the stream ends; rejects on a non-2xx answer or a network failure.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values, never copy. */
import { fetch as expoFetch } from 'expo/fetch';

import { sessionHeaders } from '@/data/app-session/device-session';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';

export interface SseFrame {
  readonly type: string;
  readonly data: Record<string, unknown>;
}

export type StreamFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; body: ReadableStream<Uint8Array> | null }>;

export class StreamError extends Error {
  constructor(readonly status: number | null) {
    super(status === null ? 'stream failed' : `stream answered ${status}`);
  }
}

/** Splits a text buffer into complete frames, returning the frames and what is left over. */
export function parseSseFrames(buffer: string): { frames: SseFrame[]; rest: string } {
  const frames: SseFrame[] = [];
  const blocks = buffer.split('\n\n');
  const rest = blocks.pop() ?? '';
  for (const block of blocks) {
    const type = /^event: (.*)$/mu.exec(block)?.[1];
    const data = /^data: (.*)$/mu.exec(block)?.[1];
    if (type === undefined || data === undefined) continue;
    try {
      frames.push({ type, data: JSON.parse(data) as Record<string, unknown> });
    } catch {
      // A torn frame is dropped; the stream's own `done` or `error` still arrives.
    }
  }
  return { frames, rest };
}

export async function streamSse(
  path: string,
  body: unknown,
  onFrame: (frame: SseFrame) => void,
  options: { signal?: AbortSignal; fetch?: StreamFetch } = {},
): Promise<void> {
  const send: StreamFetch = options.fetch ?? expoFetch;
  let response;
  try {
    response = await send(`${resolveApiBaseUrl()}${path}`, {
      method: 'POST',
      headers: {
        ...(await sessionHeaders()),
        'content-type': 'application/json',
        accept: 'text/event-stream',
      },
      body: JSON.stringify(body),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
  } catch {
    throw new StreamError(null);
  }
  if (!response.ok || response.body === null) throw new StreamError(response.status);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseSseFrames(buffer);
    buffer = parsed.rest;
    for (const frame of parsed.frames) onFrame(frame);
  }
  const tail = parseSseFrames(`${buffer}\n\n`);
  for (const frame of tail.frames) onFrame(frame);
}
