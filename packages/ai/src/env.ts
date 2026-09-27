/**
 * The gateway's own environment contract. `ANTHROPIC_BASE_URL` is an explicit local-development
 * override (an Anthropic-compatible endpoint used until Claude keys exist); when it is unset the
 * gateway always talks to Anthropic's API, never an endpoint the SDK picked up implicitly.
 * `TYPESAFE_API_KEY` enables the Jev decision client; unset, every decision route answers from its
 * Haiku twin. The Jev endpoint has no override at all (./decide/client.ts pins it).
 */
import { z } from 'zod';

/** Anthropic's API origin, pinned so an ambient ANTHROPIC_BASE_URL can never redirect traffic. */
export const ANTHROPIC_API_URL = 'https://api.anthropic.com';

const emptyAsUndefined = (value: unknown) => (value === '' ? undefined : value);

export const aiEnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_BASE_URL: z.preprocess(emptyAsUndefined, z.url().optional()),
  TYPESAFE_API_KEY: z.preprocess(emptyAsUndefined, z.string().min(1).optional()),
});
export type AiEnv = z.infer<typeof aiEnvSchema>;

export interface GatewayEnvOptions {
  readonly apiKey: string;
  readonly baseURL?: string;
}

function problemsOf(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n  ');
}

/** Validates the gateway variables (values are never echoed) and maps them to client options. */
export function loadGatewayEnv(
  source: Record<string, string | undefined> = process.env,
): GatewayEnvOptions {
  const parsed = aiEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid AI gateway environment:\n  ${problemsOf(parsed.error)}`);
  }
  const { ANTHROPIC_API_KEY: apiKey, ANTHROPIC_BASE_URL: baseURL } = parsed.data;
  return baseURL === undefined ? { apiKey } : { apiKey, baseURL };
}

const decisionEnvSchema = aiEnvSchema.pick({ TYPESAFE_API_KEY: true });

/** The Jev key, validated without echoing it; `undefined` means decisions use the Haiku twin. */
export function loadDecisionEnv(source: Record<string, string | undefined> = process.env): {
  readonly apiKey: string | undefined;
} {
  const parsed = decisionEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid AI decision environment:\n  ${problemsOf(parsed.error)}`);
  }
  return { apiKey: parsed.data.TYPESAFE_API_KEY };
}
