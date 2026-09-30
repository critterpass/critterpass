import { APP_LINK_PATH_PREFIXES, bridgeUrl } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { appleAppSiteAssociation, assetLinks } from './association';
import { forwardSupplierRedirect, supplierSubId } from './supplier-redirect';
import { linkRequestContext } from './web-env';

const SUB_ID = 'Ab3_dE5-fG7hJ9kL1mN2';
const GO = 'https://go.staging.critterpass.app';
const context = (href: string) => linkRequestContext(new URL(href), {});

/** Whether an AASA / assetlinks path pattern (`*` wildcard) claims `path`. */
function claims(pattern: string, path: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/gu, '\\$&').replace(/\*/gu, '.*');
  return new RegExp(`^${escaped}$`, 'u').test(path);
}

describe('supplier redirects on the go host', () => {
  it('matches only sub-id-shaped /out/ paths on the go host', () => {
    const go = context(bridgeUrl(SUB_ID, GO));
    expect(new URL(bridgeUrl(SUB_ID, `${GO}/`)).pathname).toBe(`/out/${SUB_ID}`);
    expect(supplierSubId(`/out/${SUB_ID}`, go)).toBe(SUB_ID);
    expect(supplierSubId(`/out/${SUB_ID}/`, go)).toBe(SUB_ID);
    expect(supplierSubId(`/r/${SUB_ID}`, go)).toBeNull();
    expect(supplierSubId('/out/K7M2QX', go)).toBeNull();
    expect(supplierSubId(`/out/${SUB_ID}x`, go)).toBeNull();
    const primary = context(`https://staging.critterpass.app/out/${SUB_ID}`);
    expect(supplierSubId(`/out/${SUB_ID}`, primary)).toBeNull();
  });

  it('keeps /out/ out of the paths the apps claim, so a partner tap never reopens the app', () => {
    const path = `/out/${SUB_ID}`;
    expect(APP_LINK_PATH_PREFIXES).not.toContain('out');
    expect(claims('/r/*', `/r/${SUB_ID}`)).toBe(true);
    for (const host of ['go.critterpass.app', 'go.staging.critterpass.app']) {
      const components = appleAppSiteAssociation(host).applinks.details.flatMap(
        (d) => d.components,
      );
      const android = assetLinks(host, {
        'app.critterpass': ['AA'],
        'app.critterpass.staging': ['AA'],
      });
      const androidComponents = android.flatMap(
        (s) =>
          s.relation_extensions['delegate_permission/common.handle_all_urls']
            .dynamic_app_link_components,
      );
      for (const c of [...components, ...androidComponents]) {
        expect(c.exclude === true || !claims(c['/'], path), `${host} ${c['/']}`).toBe(true);
      }
    }
  });

  it("returns the bridge's redirect uncached and falls through when there is none", async () => {
    const calls: string[] = [];
    const partner = 'https://tp.media/r?marker=782419&sub_id=' + SUB_ID;
    const fetchImpl = ((input: string) => {
      calls.push(input);
      return Promise.resolve(
        input.endsWith(SUB_ID)
          ? new Response(null, { status: 302, headers: { location: partner } })
          : new Response('{"error":{}}', { status: 404 }),
      );
    }) as typeof fetch;
    const apiBaseUrl = 'https://api.example.test';

    const redirect = await forwardSupplierRedirect({ apiBaseUrl, subId: SUB_ID, fetchImpl });
    expect(calls).toEqual([`${apiBaseUrl}/v1/suppliers/r/${SUB_ID}`]);
    expect(redirect?.status).toBe(302);
    expect(redirect?.headers.get('location')).toBe(partner);
    expect(redirect?.headers.get('cache-control')).toBe('no-store');

    expect(
      await forwardSupplierRedirect({ apiBaseUrl, subId: 'z'.repeat(20), fetchImpl }),
    ).toBeNull();
  });
});
