/**
 * The guide's Server-Sent Events over a streaming `fetch` (Expo's on device): posts a turn or a
 * crew mention, then hands each frame to `onFrame` as it arrives. The answer's day is the
 * device's local day, so every request carries the device zone (`X-CP-TZ`) and device id.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values, headers and api paths, never copy. */
import { fetch as expoFetch } from 'expo/fetch';

import { sessionHeaders } from '@/data/app-session/device-session';
import { createDeviceResolver } from '@/data/commands/device';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';

import {
  GuideStreamError,
  parseGuideFrames,
  refusal,
  type GuideFetch,
  type GuideFrame,
} from './guide-frames';
import type { GuideServices } from './guide-services';

const device = createDeviceResolver();

export async function streamGuide(
  path: string,
  body: unknown,
  onFrame: (frame: GuideFrame) => void,
  options: { signal?: AbortSignal; fetch?: GuideFetch } = {},
): Promise<void> {
  const send: GuideFetch = options.fetch ?? expoFetch;
  let response;
  try {
    const { id, tz } = await device();
    response = await send(`${resolveApiBaseUrl()}${path}`, {
      method: 'POST',
      headers: {
        ...(await sessionHeaders()),
        'content-type': 'application/json',
        accept: 'text/event-stream',
        'x-cp-tz': tz,
        'x-cp-device': id,
      },
      body: JSON.stringify(body),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
  } catch {
    throw new GuideStreamError(null);
  }
  if (!response.ok || response.body === null) {
    throw refusal(response.status, await response.text().catch(() => ''));
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parsed = parseGuideFrames(buffer);
      buffer = parsed.rest;
      for (const frame of parsed.frames) onFrame(frame);
    }
  } catch {
    throw new GuideStreamError(null);
  }
  for (const frame of parseGuideFrames(`${buffer}\n\n`).frames) onFrame(frame);
}

export const deviceGuideServices: GuideServices = {
  streamTurn: (threadId, body, onFrame, signal) =>
    streamGuide(`/v1/guide/threads/${threadId}/turns`, body, onFrame, { signal }),
  streamMention: (crewId, messageId, onFrame, signal) =>
    streamGuide(`/v1/guide/crew/${crewId}/mentions`, { message_id: messageId }, onFrame, {
      signal,
    }),
};
