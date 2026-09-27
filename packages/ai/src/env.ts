/**
 * The gateway's own environment contract. Generation runs on DeepSeek through its
 * Anthropic-compatible Messages API (docs/product-decisions.md D22), so the key lives in
 * `ANTHROPIC_API_KEY` (the variable the Anthropic-format client reads; it holds the DeepSeek key)
 * and requests go to `DEEPSEEK_ANTHROPIC_URL`. `ANTHROPIC_BASE_URL` is an explicit override of that
 * origin; the gateway never uses an endpoint the SDK picked up implicitly. `TYPESAFE_API_KEY`
 * enables the Jev decision client; unset, every decision route answers from its fast-tier twin.
 * The Jev endpoint has no override at all (./decide/client.ts pins it). `TAVILY_API_KEY` enables
 * web search (./tools/search), whose origin is pinned too.
 */
import { z } from 'zod';

/** DeepSeek's Anthropic-format origin, pinned so an ambient ANTHROPIC_BASE_URL never redirects traffic. */
export const DEEPSEEK_ANTHROPIC_URL = 'https://api.deepseek.com/anthropic';

const emptyAsUndefined = (value: unknown) => (value === '' ? undefined : value);

export const aiEnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_BASE_URL: z.preprocess(emptyAsUndefined, z.url().optional()),
  TYPESAFE_API_KEY: z.preprocess(emptyAsUndefined, z.string().min(1).optional()),
  /** Enables the guide's `web_search` tool (Tavily); unset, the tool answers `TOOL_UNAVAILABLE`. */
  TAVILY_API_KEY: z.preprocess(emptyAsUndefined, z.string().min(1).optional()),
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

/** The Jev key, validated without echoing it; `undefined` means decisions use the fast-tier twin. */
export function loadDecisionEnv(source: Record<string, string | undefined> = process.env): {
  readonly apiKey: string | undefined;
} {
  const parsed = decisionEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid AI decision environment:\n  ${problemsOf(parsed.error)}`);
  }
  return { apiKey: parsed.data.TYPESAFE_API_KEY };
}
