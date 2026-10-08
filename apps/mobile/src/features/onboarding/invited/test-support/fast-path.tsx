/**
 * Shared set-up for the invited fast path suites: the real local-first stack (encrypted Node
 * database, command client) with the api answered by recorded responses at the transport, and the
 * link preview answered the same way at the invite services boundary.
 */
/* eslint-disable lingui/no-unlocalized-strings -- test support; literals are wire values. */
import type { CrewWelcomeResponse, LinkPreview, LinkTarget } from '@cp/domain';
import type { ReactElement } from 'react';

import type { SyncTransport, TransportResponse } from '@/data/powersync/transport';
import { LocalFirstProvider } from '@/data/powersync/local-first-context';
import type { TestLocalFirst } from '@/data/powersync/test-support/local-first-fixture';
import type { PreviewResult } from '@/lib/links/resolver-client';

import { recordingAnalytics, renderOnboarding } from '../../test-support/harness';
import { InviteServicesProvider, type InviteServices } from '../invite-services';

export const CREW_ID = '0192e1a2-0000-7000-8000-00000000c1e0';
export const TRIP_ID = '0192e1a2-0000-7000-8000-00000000781b';

export function preview(overrides: Partial<LinkPreview> = {}): LinkPreview {
  return {
    kind: 'invite',
    crew_name: 'The Bali Six',
    inviter_first_name: 'Winston',
    trip_place: 'Bali',
    members_count: 4,
    expires_at: '2026-10-12T00:00:00.000Z',
    state: 'active',
    trip_start: '2026-10-12',
    trip_end: '2026-10-19',
    seats_taken: 1,
    seat_cap: 6,
    members: [
      { first_name: 'Winston', colour: 'yellow' },
      { first_name: 'Maya', colour: 'orange' },
    ],
    invited_waiting: 1,
    estimate_minor: 124_000,
    estimate_currency: 'USD',
    guide_slug: 'tokek',
    ...overrides,
  };
}

export function services(
  answer: PreviewResult | ((target: LinkTarget) => PreviewResult),
  uid = '0192e1a2-0000-7000-8000-0000000000aa',
  welcome: CrewWelcomeResponse | null = null,
): InviteServices & {
  readonly asked: LinkTarget[];
  readonly welcomed: { crewId: string; tripId: string | null }[];
} {
  const asked: LinkTarget[] = [];
  const welcomed: { crewId: string; tripId: string | null }[] = [];
  return {
    asked,
    welcomed,
    welcome: (crewId, tripId) => {
      welcomed.push({ crewId, tripId });
      return Promise.resolve(welcome);
    },
    preview: (target) => {
      asked.push(target);
      return Promise.resolve(typeof answer === 'function' ? answer(target) : answer);
    },
    uid: () => Promise.resolve(uid),
    now: () => Date.parse('2026-09-28T10:00:00Z'),
  };
}

/**
 * The api at the transport: each command name answers its recorded response. A list is answered in
 * order, one per call, and its last response repeats.
 */
export function recordedApi(
  answers: Readonly<Record<string, TransportResponse | readonly TransportResponse[]>>,
): SyncTransport & { readonly sent: { path: string; body: unknown }[] } {
  const sent: { path: string; body: unknown }[] = [];
  const calls = new Map<string, number>();
  return {
    sent,
    postJson(path, body) {
      sent.push({ path, body });
      const cmd = path.split('/').at(-1) ?? '';
      const recorded = answers[cmd];
      if (!Array.isArray(recorded)) {
        return Promise.resolve((recorded as TransportResponse | undefined) ?? UNREACHABLE);
      }
      const call = calls.get(cmd) ?? 0;
      calls.set(cmd, call + 1);
      const list = recorded as readonly TransportResponse[];
      return Promise.resolve(list[Math.min(call, list.length - 1)] ?? UNREACHABLE);
    },
  };
}

/** The server could not be reached. */
export const UNREACHABLE: TransportResponse = { status: 503, body: null };

export function applied(result: unknown): TransportResponse {
  return { status: 200, body: { status: 'applied', result } };
}

export function rejected(code: string, http: number, detail?: unknown): TransportResponse {
  return {
    status: http,
    body: { error: { code, message: code, retryable: false, ...(detail ? { detail } : {}) } },
  };
}

export async function renderInvited(
  ui: ReactElement,
  options: { services: InviteServices; stack?: TestLocalFirst | null },
) {
  const analytics = recordingAnalytics();
  const tree = (
    <InviteServicesProvider services={options.services}>
      {options.stack ? (
        <LocalFirstProvider value={options.stack.value}>{ui}</LocalFirstProvider>
      ) : (
        ui
      )}
    </InviteServicesProvider>
  );
  const view = await renderOnboarding(tree, { analytics });
  return { view, analytics };
}
