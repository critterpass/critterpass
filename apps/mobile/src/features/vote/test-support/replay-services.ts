/**
 * Vote services that replay recorded answers at the network seam: the pitch stream frame by frame
 * (all at once, or held so a test can look at each streaming state), search results, and the guest
 * brief. The recordings are the api's own answers for the pitch-01 and guest-01 fixtures.
 */
/* eslint-disable lingui/no-unlocalized-strings -- test support; recorded wire values. */
import type { SseFrame } from '../data/sse-client';
import type { PlaceResult } from '../data/use-destination-search';
import type { VoteServices } from '../data/vote-services';
import { JORDAN, KYOTO } from './vote-harness';

export const PITCH_ID = '0192f000-0000-7000-8000-000000000701';
export const OSAKA = '0192f000-0000-7000-8000-0000000000d4';

/** `POST /v1/pitches` for Kyoto (pitch-01), as the api streamed it; member ids are filled per test. */
export function kyotoPitchFrames(me: string): SseFrame[] {
  return [
    {
      type: 'sticker',
      data: { place_id: KYOTO, name: 'Kyoto', country: 'Japan', coverage: 'live', guide: 'pon' },
    },
    { type: 'chip', data: { kind: 'price', amount_minor: 41_200, currency: 'USD', origin: 'SIN' } },
    { type: 'chip', data: { kind: 'flight', minutes: 415, origin: 'SIN' } },
    { type: 'chip', data: { kind: 'event', name: 'Cherry blossoms', starts_on: '2027-04-03' } },
    { type: 'headline', data: { text: 'Kyoto in April: six of you, blossoms waiting' } },
    {
      type: 'reason',
      data: {
        text: 'Four of you are FOODIE — a kaiseki is the whole point.',
        tag: 'FOODIE',
        member_ids: [me],
      },
    },
    {
      type: 'reason',
      data: {
        text: 'Two of you are TEMPLES — this town has them the way Bali has scooters.',
        tag: 'TEMPLES',
        member_ids: [JORDAN],
      },
    },
    { type: 'quote', data: { text: "The deer will cope without you. The blossoms won't wait." } },
    {
      type: 'alternative',
      data: { place_id: OSAKA, name: 'Osaka', kind: 'nearby', delta_minor: null, currency: null },
    },
    { type: 'done', data: { pitch_id: PITCH_ID, cached: false, ai_generated: true } },
  ];
}

export interface HeldStream {
  /** Sends the next `count` frames. */
  step(count?: number): void;
  /** Ends the stream (a network drop when `fail`). */
  end(fail?: boolean): void;
}

export interface ReplayOptions {
  readonly pitch?: readonly SseFrame[];
  /** Hold the pitch so the test releases frames itself. */
  readonly hold?: (stream: HeldStream) => void;
  readonly results?: readonly PlaceResult[];
  readonly offline?: boolean;
  readonly brief?: readonly SseFrame[];
}

export function replayServices(options: ReplayOptions): VoteServices {
  return {
    streamPitch: (_body, onFrame) => {
      const frames = [...(options.pitch ?? [])];
      if (options.hold === undefined) {
        frames.forEach(onFrame);
        return Promise.resolve();
      }
      return new Promise((resolve, reject) => {
        options.hold?.({
          step(count = 1) {
            for (const frame of frames.splice(0, count)) onFrame(frame);
          },
          end(fail = false) {
            if (fail) reject(new Error('stream dropped'));
            else resolve();
          },
        });
      });
    },
    searchPlaces: () =>
      options.offline === true
        ? Promise.reject(new Error('offline'))
        : Promise.resolve([...(options.results ?? [])]),
    streamGuestBrief: (_placeId, _body, onFrame) => {
      (options.brief ?? []).forEach(onFrame);
      return Promise.resolve();
    },
  };
}
