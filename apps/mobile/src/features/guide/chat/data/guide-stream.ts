/**
 * The guide's Server-Sent Events over a streaming `fetch` (Expo's on device): posts a turn or a
 * crew mention, then hands each frame to `onFrame` as it arrives. The answer's day is the
 * device's local day, so every request carries the device zone (`X-CP-TZ`) and device id. The
 * reading, and giving up on a stalled stream, is ./guide-stream-reader.ts.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values, headers and api paths, never copy. */
import { fetch as expoFetch } from 'expo/fetch';

import { sessionHeaders } from '@/data/app-session/device-session';
import { createDeviceResolver } from '@/data/commands/device';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';

import { GuideStreamError, type GuideFetch, type GuideFrame } from './guide-frames';
import type { GuideServices } from './guide-services';
import { postGuideStream } from './guide-stream-reader';

const device = createDeviceResolver();

export async function streamGuide(
  path: string,
  body: unknown,
  onFrame: (frame: GuideFrame) => void,
  options: { signal?: AbortSignal; fetch?: GuideFetch } = {},
): Promise<void> {
  let request;
  try {
    const { id, tz } = await device();
    request = {
      url: `${resolveApiBaseUrl()}${path}`,
      headers: { ...(await sessionHeaders()), 'x-cp-tz': tz, 'x-cp-device': id },
      body,
    };
  } catch {
    throw new GuideStreamError(null);
  }
  await postGuideStream(
    options.fetch ?? expoFetch,
    request,
    onFrame,
    options.signal === undefined ? {} : { signal: options.signal },
  );
}

export const deviceGuideServices: GuideServices = {
  streamTurn: (threadId, body, onFrame, signal) =>
    streamGuide(`/v1/guide/threads/${threadId}/turns`, body, onFrame, { signal }),
  streamMention: (crewId, messageId, onFrame, signal) =>
    streamGuide(`/v1/guide/crew/${crewId}/mentions`, { message_id: messageId }, onFrame, {
      signal,
    }),
};
