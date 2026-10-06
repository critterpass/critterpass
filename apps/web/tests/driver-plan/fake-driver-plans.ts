/**
 * Stand-in for the api's driver plan routes at the network boundary, for the site's fake api:
 * `GET /v1/public/driver-plans/{token}` and `POST …/reply`, answering in the shapes
 * services/api/test/driver-plan-shares asserts. The page body is checked against the shared wire
 * schema at start-up; replies are validated with the api's own schema and kept for the test to
 * read back; a token can be revoked between two requests, as the crew would from the app.
 */
import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { driverPlanPageSchema, driverPlanReplyPayloadSchema } from '@cp/domain';

export const LIVE_TOKEN = 'liveDriverPlanTok01';
export const REVOKABLE_TOKEN = 'revokableDriverTok1';

const PAGE = driverPlanPageSchema.parse(
  JSON.parse(readFileSync(new URL('./fixtures/page-two-days.json', import.meta.url), 'utf8')),
);
const live = new Set([LIVE_TOKEN, REVOKABLE_TOKEN]);
const revoked = new Set<string>();
const replies: unknown[] = [];

function json(response: ServerResponse, status: number, body: unknown): true {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(body));
  return true;
}

function off(response: ServerResponse): true {
  return json(response, 410, {
    error: {
      code: 'SHARE_REVOKED',
      message: 'SHARE_REVOKED',
      retryable: false,
      detail: {
        sharer_first_name: 'Winston',
        off_at: '2026-10-20T02:00:00.000Z',
        reply_at: replies.length > 0 ? '2026-10-12T02:00:00.000Z' : null,
      },
    },
  });
}

/** Answers a driver plan request; false when the path is not one of them. */
export function handleDriverPlan(request: IncomingMessage, response: ServerResponse): boolean {
  const url = new URL(request.url ?? '/', 'http://fake-api');
  if (url.pathname === '/__driver-plan/replies') return json(response, 200, replies);
  const revoke = /^\/__driver-plan\/revoke\/([^/]+)$/.exec(url.pathname);
  if (revoke !== null) {
    revoked.add(revoke[1] ?? '');
    return json(response, 200, { ok: true });
  }
  const match = /^\/v1\/public\/driver-plans\/([^/]+)(\/reply)?$/.exec(url.pathname);
  if (match === null) return false;
  const token = match[1] ?? '';
  if (!live.has(token)) {
    return json(response, 404, { error: { code: 'NOT_FOUND', message: '', retryable: false } });
  }
  if (revoked.has(token)) return off(response);
  if (match[2] === undefined) return json(response, 200, PAGE);
  let raw = '';
  request.on('data', (chunk: Buffer) => (raw += chunk.toString('utf8')));
  request.on('end', () => {
    const parsed = driverPlanReplyPayloadSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      json(response, 422, { error: { code: 'VALIDATION', message: '', retryable: false } });
      return;
    }
    const replaced = replies.length > 0;
    replies.push(parsed.data);
    json(response, 200, { reply_id: 'r', change_set_id: null, replaced });
  });
  return true;
}
