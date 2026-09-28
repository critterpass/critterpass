import { readFileSync } from 'node:fs';

import { buildLink, linkHostsFor, parseLinkPath } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { decideHandoff } from './handoff-model';
import { linkRequestContext } from './web-env';

const LINKS_ENV_VALUES = [undefined, 'production', 'staging', 'development', 'nonsense'];

/** The production Worker's own config: its vars and the hosts it is routed on. */
function productionWrangler(): { vars: Record<string, string>; hosts: string[] } {
  const text = readFileSync(new URL('../../../wrangler.jsonc', import.meta.url), 'utf8')
    .replace(/^\s*\/\/.*$/gmu, '')
    .replace(/,(\s*[}\]])/gu, '$1');
  const config = JSON.parse(text) as {
    env: { production: { vars: Record<string, string>; routes: { pattern: string }[] } };
  };
  const production = config.env.production;
  return { vars: production.vars, hosts: production.routes.map((route) => route.pattern) };
}

function referralPage(host: string, linksEnv: string | undefined) {
  const url = new URL(`https://${host}/r/WYNST8`);
  const context = linkRequestContext(url, linksEnv === undefined ? {} : { LINKS_ENV: linksEnv });
  const target = parseLinkPath(url.pathname);
  if (target === null) throw new Error('referral path did not parse');
  const decision = decideHandoff({
    url,
    userAgent: null,
    context,
    target,
    preview: { status: 'unavailable' },
  });
  return { context, decision };
}

describe('link hosts in production', () => {
  const productionHosts = [...linkHostsFor('production'), ...productionWrangler().hosts];

  it.each(productionHosts.flatMap((host) => LINKS_ENV_VALUES.map((env) => [host, env] as const)))(
    '%s with LINKS_ENV=%s never produces a staging host',
    (host, linksEnv) => {
      const { context, decision } = referralPage(host, linksEnv);
      expect(context.config.env).toBe('production');
      expect(context.otherHost).not.toContain('staging');
      expect(context.apiBaseUrl).toBe('https://api.critterpass.app');
      if (decision.kind !== 'render') throw new Error('expected a rendered page');
      expect(decision.model.canonicalLink).toBe('https://critterpass.app/r/WYNST8');
      expect(JSON.stringify(decision.model)).not.toContain('staging');
    },
  );

  it('an unknown host under LINKS_ENV=production links to production', () => {
    for (const host of ['127.0.0.1', 'localhost', 'cp-web-production.example.workers.dev']) {
      const { context, decision } = referralPage(host, 'production');
      expect(context.config.env).toBe('production');
      if (decision.kind !== 'render') throw new Error('expected a rendered page');
      expect(JSON.stringify(decision.model)).not.toContain('staging');
    }
  });

  it('the production Worker sets LINKS_ENV to production', () => {
    expect(productionWrangler().vars['LINKS_ENV']).toBe('production');
  });

  it('staging hosts stay on staging', () => {
    const { context } = referralPage('staging.critterpass.app', 'production');
    expect(context.config.env).toBe('staging');
    expect(
      buildLink({ kind: 'referral', code: 'WYNST8' }, { host: context.config.primaryHost }),
    ).toBe('https://staging.critterpass.app/r/WYNST8');
  });
});
