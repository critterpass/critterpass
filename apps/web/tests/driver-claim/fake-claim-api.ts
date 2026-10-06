/**
 * Stand-in for the api's public driver-claim routes at the network boundary, mounted by the site
 * suite's fake api: one invite (`made-invite01`) that becomes a listing with a code, a rotating
 * listing key, pause and remove. Code `123456` is right; anything else is wrong.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

import type { DriverClaimView } from '@cp/domain';

const INVITE = 'made-invite01';
const details = {
  display_name: 'Made Suarta',
  areas: ['Ubud', 'Jatiluwih'],
  languages: ['English', 'Bahasa Indonesia'],
  vehicle_model: 'Toyota Avanza',
  seats: 6,
  day_trips: true,
};

let state: 'invited' | 'listed' | 'paused' | 'removed' = 'invited';
let keyNo = 0;
let showRatings = true;
const currentKey = () => `made-key${String(keyNo).padStart(6, '0')}`;

function rotate(): string {
  keyNo += 1;
  return currentKey();
}

function view(next?: string): DriverClaimView {
  if (state === 'removed') return { state: 'removed' };
  return {
    state,
    ...(next === undefined ? {} : { next_key: next }),
    crew_size: 6,
    masked_phone: '+62 812 •••• 7890',
    details,
    show_ratings: showRatings,
    crews_loved: 6,
    crews_rated: 6,
    top_tags: ['on_time', 'safe_driver', 'knew_the_spots'],
  };
}

function send(response: ServerResponse, status: number, body: unknown): true {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(body));
  return true;
}

async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = '';
  for await (const chunk of request) raw += String(chunk);
  return raw === '' ? {} : (JSON.parse(raw) as Record<string, unknown>);
}

const error = (code: string) => ({ error: { code, message: code, retryable: false } });

export function isDriverClaimPath(url: URL): boolean {
  return (
    url.pathname === '/__driver-claim/reset' || url.pathname.startsWith('/v1/public/driver-claims/')
  );
}

/** Answers a driver-claim route, or returns false for the caller's own routes. */
export async function handleDriverClaim(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<boolean> {
  if (url.pathname === '/__driver-claim/reset' && request.method === 'POST') {
    state = 'invited';
    keyNo = 0;
    showRatings = true;
    return send(response, 200, { ok: true });
  }
  const match = /^\/v1\/public\/driver-claims\/([^/]+)(\/[a-z]+)?$/.exec(url.pathname);
  if (match === null) return false;
  const key = decodeURIComponent(match[1] ?? '');
  const action = `${request.method} ${match[2] ?? ''}`;
  const isInvite = key === INVITE;
  const isListing = key === currentKey() && keyNo > 0;
  if (!isInvite && !isListing) return send(response, 200, { state: 'invalid' });
  if (isInvite && state !== 'invited') {
    return action === 'GET '
      ? send(response, 200, { state: 'used' })
      : send(response, 409, error('STATE_INVALID'));
  }
  const input = request.method === 'GET' ? {} : await body(request);
  switch (action) {
    case 'GET ':
      return send(response, 200, view());
    case 'POST /otp':
      return send(response, 200, { sent: true, masked_phone: '+62 812 •••• 7890' });
    case 'POST /confirm':
      if (input['code'] !== '123456') return send(response, 400, error('CODE_INVALID'));
      state = 'listed';
      showRatings = input['show_ratings'] !== false;
      return send(response, 200, view(rotate()));
    case 'POST /decline':
      state = 'removed';
      return send(response, 200, { state: 'declined' });
    case 'POST /pause':
      state = input['paused'] === true ? 'paused' : 'listed';
      return send(response, 200, view(rotate()));
    case 'PATCH /listing':
      if (typeof input['show_ratings'] === 'boolean') showRatings = input['show_ratings'];
      return send(response, 200, view(rotate()));
    case 'DELETE /listing':
      state = 'removed';
      return send(response, 200, { state: 'removed' });
    default:
      return send(response, 404, error('NOT_FOUND'));
  }
}
