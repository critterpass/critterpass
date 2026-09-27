import { describe, expect, it } from 'vitest';

import { CONTENT_SECURITY_POLICY, handleAdminRequest, type AdminWorkerEnv } from './index';

interface Captured {
  url: string;
  init: RequestInit;
}

function harness() {
  const captured: Captured[] = [];
  const assetRequests: Request[] = [];
  const env: AdminWorkerEnv = {
    API_ORIGIN: 'https://api.example.test',
    ASSETS: {
      fetch: (request) => {
        assetRequests.push(request);
        return Promise.resolve(new Response('<html></html>', { status: 200 }));
      },
    },
  };
  // The api is the network boundary: record what the Worker sends and answer like the api would.
  const fetchApi = ((url: URL, init: RequestInit) => {
    captured.push({ url: url.toString(), init });
    return Promise.resolve(
      new Response(null, {
        status: 302,
        headers: { location: '/', 'set-cookie': 'cp_admin.session_token=t; HttpOnly' },
      }),
    );
  }) as unknown as typeof fetch;
  return { env, fetchApi, captured, assetRequests };
}

describe('admin Worker', () => {
  it('proxies /v1/admin/* same-origin with the Access assertion and the client IP only', async () => {
    const { env, fetchApi, captured } = harness();
    const response = await handleAdminRequest(
      new Request('https://admin.example.test/v1/admin/auth/callback/google?code=1', {
        headers: {
          'cf-access-jwt-assertion': 'jwt',
          'cf-access-client-secret': 'leak',
          'cf-connecting-ip': '198.51.100.4',
          'x-cp-client-ip': '10.0.0.1',
          cookie: 'cp_admin.state=s',
        },
      }),
      env,
      fetchApi,
    );
    expect(captured[0]?.url).toBe('https://api.example.test/v1/admin/auth/callback/google?code=1');
    const sent = new Headers(captured[0]?.init.headers);
    expect(sent.get('cf-access-jwt-assertion')).toBe('jwt');
    expect(sent.get('cf-access-client-secret')).toBeNull();
    expect(sent.get('x-cp-client-ip')).toBe('198.51.100.4');
    expect(sent.get('cookie')).toBe('cp_admin.state=s');
    expect(captured[0]?.init.redirect).toBe('manual');
    expect(response.status).toBe(302);
    expect(response.headers.get('set-cookie')).toContain('cp_admin.session_token');
    expect(response.headers.get('content-security-policy')).toBe(CONTENT_SECURITY_POLICY);
  });

  it('serves everything else from assets without any Access header and with the CSP', async () => {
    const { env, fetchApi, captured, assetRequests } = harness();
    const response = await handleAdminRequest(
      new Request('https://admin.example.test/catalogue', {
        headers: { 'cf-access-jwt-assertion': 'jwt' },
      }),
      env,
      fetchApi,
    );
    expect(captured).toEqual([]);
    expect(assetRequests[0]?.headers.get('cf-access-jwt-assertion')).toBeNull();
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(response.headers.get('strict-transport-security')).toContain('max-age');
  });

  it('forwards a command body', async () => {
    const { env, fetchApi, captured } = harness();
    await handleAdminRequest(
      new Request('https://admin.example.test/v1/admin/cmd/set_feature_flag', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"cmd":"set_feature_flag"}',
      }),
      env,
      fetchApi,
    );
    expect(new TextDecoder().decode(captured[0]?.init.body as ArrayBuffer)).toBe(
      '{"cmd":"set_feature_flag"}',
    );
  });
});
