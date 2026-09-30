/**
 * Email Routing and raw-mail retention for crew forward addresses, as code. Prints the plan by
 * default; `--apply` sends it to the Cloudflare API (token with Email Routing Rules/DNS Edit on the
 * zone and R2 Edit on the account). Idempotent: every call puts the desired state.
 *
 *   CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ZONE_ID=… CLOUDFLARE_ACCOUNT_ID=… \
 *     pnpm --filter @cp/inbound-email exec tsx scripts/configure-routing.ts --env production [--apply]
 *
 * 1. Email Routing DNS for the `in.` subdomain (MX + SPF records Cloudflare manages).
 * 2. The zone's catch-all rule sends every unmatched address to the `cp-inbound-email` Worker.
 * 3. The raw-mail bucket deletes `inbound/` objects 7 days after upload.
 */
const TARGETS = {
  staging: {
    domain: 'in.staging.critterpass.app',
    worker: 'cp-inbound-email-staging',
    bucket: 'cp-inbound-mail-staging',
  },
  production: {
    domain: 'in.critterpass.app',
    worker: 'cp-inbound-email-production',
    bucket: 'cp-inbound-mail-prod',
  },
} as const;

const RAW_MAIL_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface PlannedCall {
  readonly method: 'POST' | 'PUT';
  readonly path: string;
  readonly body: unknown;
}

export function routingPlan(
  env: keyof typeof TARGETS,
  ids: { readonly zoneId: string; readonly accountId: string },
): PlannedCall[] {
  const target = TARGETS[env];
  return [
    {
      method: 'POST',
      path: `/zones/${ids.zoneId}/email/routing/dns`,
      body: { name: target.domain },
    },
    {
      method: 'PUT',
      path: `/zones/${ids.zoneId}/email/routing/rules/catch_all`,
      body: {
        name: 'crew forward addresses',
        enabled: true,
        matchers: [{ type: 'all' }],
        actions: [{ type: 'worker', value: [target.worker] }],
      },
    },
    {
      method: 'PUT',
      path: `/accounts/${ids.accountId}/r2/buckets/${target.bucket}/lifecycle`,
      body: {
        rules: [
          {
            id: 'inbound-raw-7d',
            enabled: true,
            conditions: { prefix: 'inbound/' },
            deleteObjectsTransition: { condition: { type: 'Age', maxAge: RAW_MAIL_TTL_SECONDS } },
          },
        ],
      },
    },
  ];
}

async function main(argv: readonly string[]): Promise<void> {
  const envIndex = argv.indexOf('--env');
  const env = argv[envIndex + 1];
  if (env !== 'staging' && env !== 'production') throw new Error('--env staging|production');
  const zoneId = process.env['CLOUDFLARE_ZONE_ID'] ?? '<zone id>';
  const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'] ?? '<account id>';
  const plan = routingPlan(env, { zoneId, accountId });
  if (!argv.includes('--apply')) {
    for (const call of plan) console.log(call.method, call.path, JSON.stringify(call.body));
    return;
  }
  const token = process.env['CLOUDFLARE_API_TOKEN'];
  if (token === undefined) throw new Error('CLOUDFLARE_API_TOKEN is unset');
  for (const call of plan) {
    const response = await fetch(`https://api.cloudflare.com/client/v4${call.path}`, {
      method: call.method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(call.body),
    });
    console.log(call.method, call.path, response.status);
    if (!response.ok) throw new Error(`${call.path} answered ${response.status}`);
  }
}

if (import.meta.url === `file://${process.argv[1] ?? ''}`) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
