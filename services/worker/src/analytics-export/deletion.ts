/**
 * Erases a purged account from PostHog: finds the person by its pseudonymous `user_pid` and
 * deletes it together with its events. Called by the account-deletion job at purge time. A
 * person that never consented has no profile, so "not found" is success.
 */
import { userPid } from '@cp/domain';

export interface PosthogAdminOptions {
  /** Personal API key with person:write on the project. */
  readonly apiKey: string;
  readonly projectId: string;
  /** Private API host (not the capture host). */
  readonly host?: string;
  readonly fetch?: typeof fetch;
}

export async function deleteAnalyticsPerson(
  options: PosthogAdminOptions,
  uid: string,
  pidSalt: string,
): Promise<'deleted' | 'not_found'> {
  const send = options.fetch ?? fetch;
  const base = new URL(
    `/api/projects/${options.projectId}/persons/`,
    options.host ?? 'https://eu.posthog.com',
  );
  const headers = { authorization: `Bearer ${options.apiKey}` };
  const lookup = new URL(base);
  lookup.searchParams.set('distinct_id', await userPid(uid, pidSalt));
  const found = await send(lookup, { headers });
  if (!found.ok) throw new Error(`posthog person lookup failed with HTTP ${found.status}`);
  const person = ((await found.json()) as { results: { id: string }[] }).results[0];
  if (person === undefined) return 'not_found';
  const target = new URL(`${person.id}/`, base);
  target.searchParams.set('delete_events', 'true');
  const deleted = await send(target, { method: 'DELETE', headers });
  if (!deleted.ok && deleted.status !== 404) {
    throw new Error(`posthog person delete failed with HTTP ${deleted.status}`);
  }
  return 'deleted';
}
