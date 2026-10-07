/**
 * Redacting an erased account's feedback in the tracker, against GitHub's documented response
 * shapes (test/fixtures/account-purge/github-*.json): the issue a ticket opened loses its words,
 * a ticket added to another issue loses only its own comment, an issue that is gone is nothing
 * left, and a refusal fails so the step is retried.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  redactTicketInTracker,
  REDACTED_TEXT,
  trackerRedactionFromEnv,
} from '../../src/jobs/account/purge-tracker';

const fixture = (name: string) =>
  readFileSync(new URL(`../fixtures/account-purge/${name}`, import.meta.url), 'utf8');

interface Call {
  readonly line: string;
  readonly body: Record<string, unknown> | null;
}

/** The tracker at the network boundary; patched issues and comments answer patched afterwards. */
function tracker(status: Readonly<Record<string, number>> = {}) {
  const calls: Call[] = [];
  const patched = new Map<string, Record<string, unknown>>();
  const send: typeof fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const path = url.pathname.replace('/repos/critterpass/feedback', '');
    const body =
      request.method === 'PATCH' ? ((await request.json()) as Record<string, unknown>) : null;
    calls.push({ line: `${request.method} ${path}${url.search}`, body });
    const refused = status[path];
    if (refused !== undefined) return new Response('{}', { status: refused });
    if (body !== null) {
      patched.set(path, body);
      return Response.json(body);
    }
    const merge = (name: string) => ({
      ...(JSON.parse(fixture(name)) as Record<string, unknown>),
      ...patched.get(path),
    });
    if (path === '/issues/41') return Response.json(merge('github-issue-own.json'));
    if (path === '/issues/38') return Response.json(merge('github-issue-other.json'));
    if (path === '/issues/38/comments') {
      const comments = JSON.parse(fixture('github-comments.json')) as { id: number }[];
      return Response.json(
        comments.map((comment) => ({
          ...comment,
          ...patched.get(`/issues/comments/${comment.id}`),
        })),
      );
    }
    return new Response('{"message":"Not Found"}', { status: 404 });
  };
  return { calls, options: { repo: 'critterpass/feedback', token: 'test-token', fetch: send } };
}

describe('feedback tracker redaction', () => {
  it('blanks the issue a ticket opened and keeps its number', async () => {
    const { calls, options } = tracker();
    expect(await redactTicketInTracker(options, 1207, 41)).toBe('issue');
    expect(calls.map((call) => call.line)).toEqual(['GET /issues/41', 'PATCH /issues/41']);
    expect(calls[1]?.body).toEqual({
      title: '[CP-1207] Removed',
      body: `- Ticket: CP-1207\n\n${REDACTED_TEXT}`,
    });
    expect(JSON.stringify(calls[1]?.body)).not.toContain('dinner');

    // A second run reads the redacted issue and changes nothing.
    expect(await redactTicketInTracker(options, 1207, 41)).toBe('nothing_left');
    expect(calls.filter((call) => call.line.startsWith('PATCH'))).toHaveLength(1);
  });

  it('blanks only the ticket’s own comment on another ticket’s issue', async () => {
    const { calls, options } = tracker();
    expect(await redactTicketInTracker(options, 1207, 38)).toBe('comment');
    const patches = calls.filter((call) => call.line.startsWith('PATCH'));
    expect(patches.map((call) => call.line)).toEqual(['PATCH /issues/comments/9003']);
    expect(patches[0]?.body).toEqual({ body: `Another report: CP-1207\n\n${REDACTED_TEXT}` });

    expect(await redactTicketInTracker(options, 1207, 38)).toBe('nothing_left');
    expect(calls.filter((call) => call.line.startsWith('PATCH'))).toHaveLength(1);
  });

  it('finds nothing left when the issue is gone', async () => {
    const { calls, options } = tracker();
    expect(await redactTicketInTracker(options, 1207, 77)).toBe('nothing_left');
    expect(calls.map((call) => call.line)).toEqual(['GET /issues/77']);
  });

  it('fails when the tracker refuses, so the step is retried', async () => {
    const { options } = tracker({ '/issues/41': 403 });
    await expect(redactTicketInTracker(options, 1207, 41)).rejects.toThrow(/answered 403/);
  });

  it('is not configured unless both the repository and the token are set', () => {
    expect(trackerRedactionFromEnv({})).toBeNull();
    expect(trackerRedactionFromEnv({ FEEDBACK_GITHUB_REPO: 'critterpass/feedback' })).toBeNull();
    expect(trackerRedactionFromEnv({ FEEDBACK_GITHUB_TOKEN: 'test-token' })).toBeNull();
    expect(
      trackerRedactionFromEnv({
        FEEDBACK_GITHUB_REPO: 'critterpass/feedback',
        FEEDBACK_GITHUB_TOKEN: 'test-token',
      }),
    ).toEqual({ repo: 'critterpass/feedback', token: 'test-token' });
  });
});
