/**
 * Network-boundary double for the link endpoints: answers with fixture bodies in the api's wire
 * shapes (./fixtures, the same shapes services/api/test/links/links-routes.db.test.ts asserts) and
 * records every request.
 */
import type { LinksHttp, LinksHttpResponse } from '../resolver-client';

import claimApplied from './fixtures/claim-applied.json';
import claimCodeInvalid from './fixtures/claim-code-invalid.json';
import notFound from './fixtures/not-found.json';
import previewActiveInvite from './fixtures/preview-active-invite.json';

export const FIXTURES = { claimApplied, claimCodeInvalid, notFound, previewActiveInvite };

export type Route = (input: { method: string; path: string; body?: unknown }) => LinksHttpResponse;

export function fakeLinksHttp(route: Route) {
  const requests: { method: string; path: string; body?: unknown }[] = [];
  const http: LinksHttp = {
    request: (input) => {
      requests.push(input);
      return Promise.resolve(route(input));
    },
  };
  return { http, requests };
}

/** Previews: `BAX6XA` is a live invite, anything else is unknown; claims apply. */
export const standardRoutes: Route = ({ method, path }) => {
  if (method === 'GET' && path.startsWith('/v1/links/BAX6XA/preview')) {
    return { status: 200, body: previewActiveInvite };
  }
  if (method === 'POST' && path === '/v1/links/claim') return { status: 200, body: claimApplied };
  return { status: 404, body: notFound };
};
