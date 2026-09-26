/**
 * Validates each service's environment schema against the current environment or an env file.
 * Prints variable names and problems only, never values.
 *
 *   pnpm env:check                                    # every service, current process env
 *   pnpm env:check --service api                      # one service
 *   pnpm env:check --env-file services/api/.env.example
 */
import { readFileSync } from 'node:fs';
import { parseArgs, parseEnv } from 'node:util';

import type { ZodType } from 'zod';

import { apiEnvSchema } from '../../services/api/src/env';
import { workerEnvSchema } from '../../services/worker/src/env';

export const serviceEnvSchemas: Record<string, ZodType> = {
  api: apiEnvSchema,
  worker: workerEnvSchema,
};

export interface EnvCheckResult {
  service: string;
  ok: boolean;
  problems: string[];
}

export function checkServiceEnv(
  service: string,
  env: Record<string, string | undefined>,
): EnvCheckResult {
  const schema = serviceEnvSchemas[service];
  if (!schema) return { service, ok: false, problems: [`unknown service "${service}"`] };
  const parsed = schema.safeParse(env);
  return parsed.success
    ? { service, ok: true, problems: [] }
    : {
        service,
        ok: false,
        problems: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      };
}

function main() {
  const { values } = parseArgs({
    options: { service: { type: 'string' }, 'env-file': { type: 'string' } },
  });
  const envFile = values['env-file'];
  const env = envFile ? { ...parseEnv(readFileSync(envFile, 'utf8')) } : process.env;
  const services = values.service ? [values.service] : Object.keys(serviceEnvSchemas);

  const results = services.map((service) => checkServiceEnv(service, env));
  for (const result of results) {
    console.log(result.ok ? `ok    ${result.service}` : `FAIL  ${result.service}`);
    for (const problem of result.problems) console.log(`        ${problem}`);
  }
  if (results.some((result) => !result.ok)) process.exit(1);
}

if (import.meta.main) main();
