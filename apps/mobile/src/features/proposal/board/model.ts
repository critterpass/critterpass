/**
 * What an RSVP's answer means on the boarding screen: boarded, kept as a waitlist place because
 * the trip is full (`SEAT_CAP_REACHED` comes back applied, never as an error), queued while
 * offline (the board shows as pending until the server answers), or refused.
 */
import { SEAT_CAP_REACHED } from '@cp/domain';

import type { SendResult } from '@/data/commands/client';

export type BoardOutcome =
  | { readonly kind: 'boarded' }
  | { readonly kind: 'answered'; readonly status: 'maybe' | 'out' }
  | {
      readonly kind: 'waitlisted';
      readonly position: number | null;
      readonly cap: number | null;
      readonly boostActive: boolean;
    }
  | { readonly kind: 'pending' }
  | { readonly kind: 'refused'; readonly code: string }
  | { readonly kind: 'unreachable' };

interface RsvpAnswer {
  readonly rsvp?: unknown;
  readonly waitlisted?: unknown;
  readonly code?: unknown;
  readonly waitlist_position?: unknown;
  readonly cap?: unknown;
  readonly boost_active?: unknown;
}

export function boardOutcome(result: SendResult): BoardOutcome {
  switch (result.kind) {
    case 'queued':
      return { kind: 'pending' };
    case 'rejected':
      return { kind: 'refused', code: result.code };
    case 'unavailable':
      return { kind: 'unreachable' };
    case 'applied': {
      const answer = (result.result ?? {}) as RsvpAnswer;
      if (answer.waitlisted === true || answer.code === SEAT_CAP_REACHED) {
        return {
          kind: 'waitlisted',
          position: typeof answer.waitlist_position === 'number' ? answer.waitlist_position : null,
          cap: typeof answer.cap === 'number' ? answer.cap : null,
          boostActive: answer.boost_active === true,
        };
      }
      if (answer.rsvp === 'maybe' || answer.rsvp === 'out') {
        return { kind: 'answered', status: answer.rsvp };
      }
      return { kind: 'boarded' };
    }
  }
}

/** A three-letter board code for a place with no airport code on file ("Đà Nẵng" → "DAN"). */
export function placeCode(name: string): string {
  const letters = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/giu, 'd')
    .replace(/[^a-z]/giu, '')
    .toUpperCase();
  return letters.slice(0, 3) || '···';
}
