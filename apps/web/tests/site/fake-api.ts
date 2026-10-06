/**
 * Stand-in for the api at the network boundary: `GET /v1/links/{token}/preview` and
 * `GET /v1/links/settings` answering with fixture bodies (./fixtures and ../links/fixtures), each
 * checked against the shared wire schema at start-up so a contract change fails here first.
 * `POST /__revoke/{code}` flips a code to revoked, as the organiser would from the app.
 *
 *   tsx tests/site/fake-api.ts <port>
 */
import { readFileSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';

import { linkPreviewSchema, linkSettingsSchema, publicProposalSchema } from '@cp/domain';

function fixture(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
}

function preview(path: string): unknown {
  return linkPreviewSchema.parse(fixture(path));
}

/** Codes are data keys; mutable so a test can revoke a code between two requests. */
const PREVIEWS = new Map<string, unknown>([
  ['BAX6XA', preview('../links/fixtures/preview-active-invite.json')],
  ['BAX6XC', preview('../links/fixtures/preview-revoked-invite.json')],
  ['SANDY4', preview('./fixtures/preview-trip-invite.json')],
  ['EXPR22', preview('./fixtures/preview-expired-invite.json')],
  ['FAWN33', preview('./fixtures/preview-full-invite.json')],
  ['WYNST8', preview('./fixtures/preview-referral.json')],
  ['FRAP44', preview('./fixtures/preview-trip-invite.json')],
  ['VANE55', preview('./fixtures/preview-trip-invite.json')],
]);
/** The sent draft behind SANDY4; every other code has none. */
const PROPOSALS = new Map<string, unknown>([
  ['SANDY4', publicProposalSchema.parse(fixture('./fixtures/public-proposal.json'))],
]);
const REVOKED = preview('../links/fixtures/preview-revoked-invite.json');
const NOT_FOUND = fixture('../links/fixtures/error-not-found.json');
const SETTINGS = linkSettingsSchema.parse({ app_clip: false });
const port = Number(process.argv[2] ?? '4398');

function json(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(body));
}

createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://fake-api');
  if (url.pathname === '/v1/links/settings') return json(response, 200, SETTINGS);
  // Test control: revoke a code, as the organiser would from the app.
  const revoke = /^\/__revoke\/([^/]+)$/.exec(url.pathname);
  if (revoke !== null && request.method === 'POST') {
    PREVIEWS.set(decodeURIComponent(revoke[1] ?? ''), REVOKED);
    return json(response, 200, { ok: true });
  }
  const proposal = /^\/v1\/public\/proposal\/([^/]+)$/.exec(url.pathname);
  if (proposal !== null) {
    const found = PROPOSALS.get(decodeURIComponent(proposal[1] ?? ''));
    return found === undefined ? json(response, 404, NOT_FOUND) : json(response, 200, found);
  }
  const match = /^\/v1\/links\/([^/]+)\/preview$/.exec(url.pathname);
  const body = match === null ? undefined : PREVIEWS.get(decodeURIComponent(match[1] ?? ''));
  if (body === undefined) return json(response, 404, NOT_FOUND);
  return json(response, 200, body);
}).listen(port, '127.0.0.1');
