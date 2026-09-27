/**
 * Stand-in for the api's `GET /v1/links/{token}/preview` at the network boundary, answering with
 * fixture bodies in the shape services/api/test/links/links-routes.db.test.ts asserts (./fixtures).
 * Each body is checked against the shared wire schema at start-up, so a contract change fails here
 * first.
 *
 *   tsx tests/links/fake-api.ts <port>
 */
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

import { linkPreviewSchema } from '@cp/domain';

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
}

const PREVIEWS: Record<string, unknown> = {
  BAX6XA: linkPreviewSchema.parse(fixture('preview-active-invite')),
  BAX6XC: linkPreviewSchema.parse(fixture('preview-revoked-invite')),
};
const NOT_FOUND = fixture('error-not-found');
const port = Number(process.argv[2] ?? '4398');

createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://fake-api');
  const match = /^\/v1\/links\/([^/]+)\/preview$/.exec(url.pathname);
  const body = match === null ? undefined : PREVIEWS[decodeURIComponent(match[1] ?? '')];
  response.setHeader('content-type', 'application/json');
  if (body === undefined) {
    response.statusCode = 404;
    response.end(JSON.stringify(NOT_FOUND));
    return;
  }
  response.end(JSON.stringify(body));
}).listen(port, '127.0.0.1');
