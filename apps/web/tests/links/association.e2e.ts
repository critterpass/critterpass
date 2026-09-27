import { expect, test } from '@playwright/test';

import { TEST_FINGERPRINT } from './playwright.config';

const PRODUCTION_HOSTS = ['critterpass.app', 'go.critterpass.app'];
const STAGING_HOSTS = ['staging.critterpass.app', 'go.staging.critterpass.app'];
const APP_PATHS = ['/i/*', '/j/*', '/p/*', '/r/*', '/plan/*', '/g/*', '/locals/*', '/app/*'];
const EXCLUDED = ['/', '/tips*', '/legal*', '/help*', '/account*'];

interface Component {
  readonly '/': string;
  readonly exclude?: boolean;
}
interface Aasa {
  readonly applinks: { readonly details: { appIDs: string[]; components: Component[] }[] };
  readonly webcredentials: { readonly apps: string[] };
  readonly appclips?: unknown;
}

for (const host of [...PRODUCTION_HOSTS, ...STAGING_HOSTS]) {
  const appIds = PRODUCTION_HOSTS.includes(host)
    ? ['YFND2EEW8S.app.critterpass']
    : ['YFND2EEW8S.app.critterpass.staging', 'YFND2EEW8S.app.critterpass.dev'];

  test(`apple-app-site-association on ${host}: JSON, no redirect, excludes before app paths`, async ({
    request,
  }) => {
    const response = await request.get('/.well-known/apple-app-site-association', {
      headers: { host },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('application/json');
    const body = (await response.json()) as Aasa;
    const [details] = body.applinks.details;
    expect(details?.appIDs).toEqual(appIds);
    expect(body.webcredentials.apps).toEqual(appIds);
    expect(body.appclips).toBeUndefined();
    const components = details?.components ?? [];
    expect(components.slice(0, EXCLUDED.length)).toEqual(
      EXCLUDED.map((path) => ({ '/': path, exclude: true })),
    );
    expect(components.slice(EXCLUDED.length).map((component) => component['/'])).toEqual(APP_PATHS);
  });

  test(`assetlinks.json on ${host}: JSON, no redirect, signing fingerprints`, async ({
    request,
  }) => {
    const response = await request.get('/.well-known/assetlinks.json', {
      headers: { host },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('application/json');
    const statements = (await response.json()) as {
      relation: string[];
      target: { namespace: string; package_name: string; sha256_cert_fingerprints: string[] };
      relation_extensions: Record<string, { dynamic_app_link_components: Component[] }>;
    }[];
    const expectedPackages = PRODUCTION_HOSTS.includes(host)
      ? ['app.critterpass']
      : ['app.critterpass.staging'];
    expect(statements.map((statement) => statement.target.package_name)).toEqual(expectedPackages);
    for (const statement of statements) {
      expect(statement.relation).toContain('delegate_permission/common.handle_all_urls');
      expect(statement.target.namespace).toBe('android_app');
      expect(statement.target.sha256_cert_fingerprints).toEqual([TEST_FINGERPRINT]);
      const dynamic =
        statement.relation_extensions['delegate_permission/common.handle_all_urls']
          ?.dynamic_app_link_components ?? [];
      expect(dynamic.map((component) => component['/'])).toEqual([...EXCLUDED, ...APP_PATHS]);
    }
  });
}
