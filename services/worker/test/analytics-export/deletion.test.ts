import { userPid } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { deleteAnalyticsPerson } from '../../src/analytics-export';

const UID = '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b';
const SALT = 'test-analytics-pid-salt';

/** PostHog's persons API at the network boundary. */
function fakePosthog(persons: { id: string; distinct: string }[]) {
  const calls: string[] = [];
  const fetchStub: typeof fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    calls.push(`${init?.method ?? 'GET'} ${url.pathname}${url.search}`);
    if ((init?.method ?? 'GET') === 'GET') {
      const results = persons.filter(
        (person) => person.distinct === url.searchParams.get('distinct_id'),
      );
      return Promise.resolve(Response.json({ results }));
    }
    return Promise.resolve(new Response(null, { status: 202 }));
  };
  return { fetchStub, calls };
}

describe('deleteAnalyticsPerson', () => {
  it('deletes the person found by pid, with its events', async () => {
    const pid = await userPid(UID, SALT);
    const posthog = fakePosthog([{ id: 'person-1', distinct: pid }]);
    const outcome = await deleteAnalyticsPerson(
      { apiKey: 'phx_test', projectId: '42', fetch: posthog.fetchStub },
      UID,
      SALT,
    );
    expect(outcome).toBe('deleted');
    expect(posthog.calls).toEqual([
      `GET /api/projects/42/persons/?distinct_id=${pid}`,
      'DELETE /api/projects/42/persons/person-1/?delete_events=true',
    ]);
    expect(posthog.calls.join(' ')).not.toContain(UID);
  });

  it('treats a person without a profile as done', async () => {
    const posthog = fakePosthog([]);
    expect(
      await deleteAnalyticsPerson(
        { apiKey: 'phx_test', projectId: '42', fetch: posthog.fetchStub },
        UID,
        SALT,
      ),
    ).toBe('not_found');
  });
});
