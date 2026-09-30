import { describe, expect, it } from 'vitest';

import { forwardSupplierRedirect, supplierSubId } from './supplier-redirect';
import { linkRequestContext } from './web-env';

const SUB_ID = 'Ab3_dE5-fG7hJ9kL1mN2';
const context = (href: string) => linkRequestContext(new URL(href), {});

describe('supplier redirects on the go host', () => {
  it('matches only sub-id-shaped /r/ paths on the go host', () => {
    const go = context(`https://go.staging.critterpass.app/r/${SUB_ID}`);
    expect(supplierSubId(`/r/${SUB_ID}`, go)).toBe(SUB_ID);
    expect(supplierSubId(`/r/${SUB_ID}/`, go)).toBe(SUB_ID);
    expect(supplierSubId('/r/K7M2QX', go)).toBeNull();
    expect(supplierSubId(`/r/${SUB_ID}x`, go)).toBeNull();
    expect(supplierSubId(`/i/${SUB_ID}`, go)).toBeNull();
    const primary = context(`https://staging.critterpass.app/r/${SUB_ID}`);
    expect(supplierSubId(`/r/${SUB_ID}`, primary)).toBeNull();
  });

  it("returns the bridge's redirect uncached and falls through when there is none", async () => {
    const calls: string[] = [];
    const partner = 'https://www.aviasales.com/search?marker=782419.' + SUB_ID;
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

    const unknown = await forwardSupplierRedirect({ apiBaseUrl, subId: 'z'.repeat(20), fetchImpl });
    expect(unknown).toBeNull();
  });
});
