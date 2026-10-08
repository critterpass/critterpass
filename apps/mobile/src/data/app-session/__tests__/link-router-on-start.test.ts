/**
 * App start gives the deep-link router its signed-in state check (link previews from the api,
 * answered here from recorded fixtures) and its local membership lookups (synced `crew_members`
 * and `join_codes` on the real database); stopping the session takes both away again.
 */
import { generateUuidV7 } from '@cp/domain';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import { clearPendingLink, setOnboardingComplete } from '../../../lib/links/pending';
import { resetLinkRouterForTests, routeIncomingUrl } from '../../../lib/links/router';
import { resetOnSignOutHooksForTests } from '../../auth/sign-out-hooks';
import { waitUntil } from '../../realtime/test-support/lifecycle';
import { sessionHarness, type SessionHarness } from '../test-support/session-deps';

const INVITE_URL = 'https://critterpass.app/i/BAX6XA';

let harness: SessionHarness | undefined;

beforeEach(() => {
  resetLinkRouterForTests();
  clearPendingLink();
  setOnboardingComplete(true);
});

afterEach(async () => {
  await harness?.close();
  harness = undefined;
  resetOnSignOutHooksForTests();
  resetLinkRouterForTests();
  setOnboardingComplete(false);
});

describe('link router on app start', () => {
  it('checks link state with the api once the session is up, and stops with it', async () => {
    harness = sessionHarness({ online: true });
    expect(await routeIncomingUrl(INVITE_URL)).not.toContain('state=active');

    const session = await harness.start();

    expect(await routeIncomingUrl(INVITE_URL)).toContain('state=active');
    expect(harness.linkRequests.map((request) => request.path)).toEqual([
      '/v1/links/BAX6XA/preview?kind=invite',
    ]);

    session.stop();
    expect(await routeIncomingUrl(INVITE_URL)).not.toContain('state=active');
  });

  it("opens the crew for a code of one of the user's own crews", async () => {
    harness = sessionHarness({ online: true });
    const session = await harness.start();
    const crewId = generateUuidV7();

    await session.localFirst.db.execute(
      "INSERT INTO crew_members (id, crew_id, user_id, status) VALUES (?, ?, ?, 'active')",
      [generateUuidV7(), crewId, session.uid],
    );
    await session.localFirst.db.execute(
      "INSERT INTO join_codes (id, code, crew_id, status) VALUES (?, 'BAX6XA', ?, 'active')",
      [generateUuidV7(), crewId],
    );

    let route = '';
    await waitUntil(
      () => {
        void routeIncomingUrl(INVITE_URL).then((next) => {
          route = next;
        });
        return route === `/?crewId=${crewId}`;
      },
      5000,
      'member route',
    );
  });
});
