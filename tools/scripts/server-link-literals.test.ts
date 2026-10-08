import { describe, expect, it } from 'vitest';

import {
  appRoutes,
  isServiceSource,
  linkLiteralsIn,
  serverLinkLiterals,
} from './server-link-literals';

const routes = appRoutes();
const found = (source: string) =>
  linkLiteralsIn('services/worker/src/jobs/probe.ts', source, routes).map(
    (literal) => `${literal.why}: ${literal.text}`,
  );

describe('hand-written in-app links', () => {
  it('flags a path or URL typed into a link field, whether or not a screen has it', () => {
    expect(found('const push = { deepLink: `/polls/${poll.id}` };')).toEqual([
      'link field: /polls/${…}',
    ]);
    expect(found("const row = { deep_link: ready ? '/wallet/money/settle' : null };")).toEqual([
      'link field: /wallet/money/settle',
    ]);
    expect(found("const deepLink = (id: string) => id ?? '/nowhere';")).toEqual([]);
    expect(found("const deeplink = id === null ? '/nowhere' : `/somewhere/${id}`;")).toEqual([
      'link field: /nowhere',
      'link field: /somewhere/${…}',
    ]);
  });

  it('flags a path a route file matches, wherever it is written', () => {
    expect(found('export const link = (id: string) => `/crew/${id}/chat`;')).toEqual([
      'app route: /crew/${…}/chat',
    ]);
    expect(found('const open = `/trip/${tripId}/review/${changeSetId}`;')).toEqual([
      'app route: /trip/${…}/review/${…}',
    ]);
    expect(found('const check = `/${tripId}/check`;')).toEqual(['app route: /${…}/check']);
    expect(found("const target = { path: '/pass' };")).toEqual(['app route: /pass']);
    expect(found('const memory = `/memory/${id}?trip=${tripId}`;')).toEqual([
      'app route: /memory/${…}?trip=${…}',
    ]);
  });

  it("flags a URL under the app's scheme and the web form of an in-app route", () => {
    expect(found("const ride = { url: 'critterpass://getting-around' };")).toEqual([
      'app scheme: critterpass://getting-around',
    ]);
    expect(found('const back = new URL(`${scheme}://setup/calendar/connected`);')).toEqual([
      'app scheme: ${…}://setup/calendar/connected',
    ]);
    expect(found('const web = `/app/recap/${tripId}`;')).toEqual(['web app path: /app/recap/${…}']);
  });

  it('allows a link written through a builder', () => {
    expect(
      found(`import { crewChatLink, paymentLink } from '@cp/domain';
        const push = { deepLink: paymentLink(str(routed, 'payment_id') ?? '') };
        const row = { deep_link: crewId === null ? null : crewChatLink(crewId) };`),
    ).toEqual([]);
  });

  it('leaves api paths, other URLs, the bare scheme and SQL alone', () => {
    expect(
      found(`import { helper } from '../polls/shared';
        app.get('/v1/places', handler);
        app.get('/v1/trips/:id/plan', handler);
        const url = \`https://\${host}/crew/\${id}\`;
        const upstream = \`\${base}/api/publish\`;
        const trusted = ['critterpass://', 'critterpass-staging://'];
        const parts = key.split('/');
        const sql = 'SELECT deep_link FROM inbox_items WHERE id = $1';
        const other = \`\${protocol}://\${host}/v1/health\`;`),
    ).toEqual([]);
  });

  it('reads service sources, their tests aside', () => {
    expect(isServiceSource('services/worker/src/jobs/money/pushes.ts')).toBe(true);
    expect(isServiceSource('services/api/src/routes/mailbox-oauth.ts')).toBe(true);
    expect(isServiceSource('services/worker/test/push-send.test.ts')).toBe(false);
    expect(isServiceSource('services/api/src/dev/__tests__/demo.test.ts')).toBe(false);
    expect(isServiceSource('packages/domain/src/links/app-links.ts')).toBe(false);
  });
});

describe('service sources', { timeout: 60_000 }, () => {
  it('write every in-app link through a builder from @cp/domain', () => {
    const literals = serverLinkLiterals().map(
      (literal) => `${literal.file}:${literal.line} ${literal.why}: ${literal.text}`,
    );
    expect(
      literals,
      'Use a builder from packages/domain/src/links/app-links.ts (add one, with its sample, for a new screen).',
    ).toEqual([]);
  });
});
