/**
 * Gemini, the vision fallback behind the gateway (docs/product-decisions.md D22: added "only when
 * needed"): it reads what DeepSeek cannot be given, a screenshot with no text for on-device OCR to
 * read and a public YouTube video, for adding places from a link. Every call is gated by the
 * `ai.gemini_vision` switch (off by default: off means no request ever leaves) and the route's kill
 * switch, is billed as tier `gemini` on `ai_usage` and traced like any gateway call, and keeps
 * nothing: the image or video URL lives only in the request. Structured replies follow the gateway
 * rules: the schema goes in as an instruction with a JSON response type, a safety block or the
 * decline marker is `AI_REFUSED`, and the caller validates the shape.
 */
import type Anthropic from '@anthropic-ai/sdk';
import type { AiRoute } from '@cp/domain';
import { switchedOffError } from '@cp/domain';

import type { AssertRouteOn } from '../client';
import { GatewayError, RETRYABLE_STATUSES, toGatewayError } from '../errors';
import { computeCostMicros, type TokenUsage } from '../pricing';
import { DECLINE_MARKER, structuredInstruction } from '../structured';
import type { Telemetry } from '../telemetry/langfuse';
import { buildUsageRecord, type AiUsageRecord, type UsageContext } from '../usage';

/** Gemini 3.8 Flash: reads images and public YouTube videos (ai.google.dev/gemini-api/docs/models). */
export const GEMINI_MODEL = 'gemini-3.8-flash';
export const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta';
/** The ops switch that lets any request reach Gemini. */
export const GEMINI_VISION_KEY = 'ai.gemini_vision';

export const GEMINI_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const;
/** Largest screenshot sent inline (Gemini's inline request limit is 20 MB in all). */
export const GEMINI_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

export type GeminiMedia =
  | {
      readonly kind: 'image';
      readonly mimeType: (typeof GEMINI_IMAGE_TYPES)[number];
      readonly data: Uint8Array;
    }
  | { readonly kind: 'video'; readonly url: string };

export interface GeminiRequest {
  readonly system: string;
  readonly text: string;
  readonly media: GeminiMedia;
  readonly outputFormat?: Anthropic.Messages.JSONOutputFormat;
  readonly maxOutputTokens: number;
  readonly signal?: AbortSignal;
}

export interface GeminiResult {
  readonly text: string;
  readonly usage: TokenUsage;
  readonly costMicros: number;
}

export interface GeminiOptions {
  readonly apiKey: string;
  /** Reads `ai.gemini_vision`; false (the default) means no request leaves. */
  readonly enabled: () => Promise<boolean>;
  /** The route's kill switch and the gemini tier's switch and cost-guard pause. */
  readonly assertRouteOn?: AssertRouteOn;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  readonly onUsage?: (record: AiUsageRecord) => Promise<void>;
  readonly telemetry?: Telemetry;
  readonly now?: () => Date;
}

export interface GeminiVision {
  call(route: AiRoute, request: GeminiRequest, context?: UsageContext): Promise<GeminiResult>;
}

const YOUTUBE_ID = /^[\w-]{11}$/u;

/** The canonical watch URL of a public YouTube video, or null for anything else. */
export function youtubeWatchUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  const host = url.hostname.replace(/^(www\.|m\.)/u, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = url.pathname.slice(1);
  else if (host === 'youtube.com' && url.pathname === '/watch') id = url.searchParams.get('v');
  else if (host === 'youtube.com' && url.pathname.startsWith('/shorts/')) {
    id = url.pathname.slice('/shorts/'.length);
  }
  return id !== null && YOUTUBE_ID.test(id) ? `https://www.youtube.com/watch?v=${id}` : null;
}

function mediaPart(media: GeminiMedia): Record<string, unknown> {
  if (media.kind === 'video') {
    const url = youtubeWatchUrl(media.url);
    if (url === null) throw new GatewayError('AI_UNAVAILABLE', 'not a public YouTube video URL');
    return { file_data: { file_uri: url } };
  }
  if (media.data.byteLength === 0 || media.data.byteLength > GEMINI_IMAGE_MAX_BYTES) {
    throw new GatewayError('AI_UNAVAILABLE', 'screenshot is empty or too large');
  }
  return {
    inline_data: { mime_type: media.mimeType, data: Buffer.from(media.data).toString('base64') },
  };
}

/** The `generateContent` body for one request (REST field names, documented shape). */
export function buildGeminiBody(request: GeminiRequest): Record<string, unknown> {
  const system =
    request.outputFormat === undefined
      ? request.system
      : `${request.system}\n\n${structuredInstruction(request.outputFormat)}`;
  return {
    system_instruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [mediaPart(request.media), { text: request.text }] }],
    generation_config: {
      temperature: 0,
      max_output_tokens: request.maxOutputTokens,
      ...(request.outputFormat === undefined ? {} : { response_mime_type: 'application/json' }),
      // A video is read at low resolution: places are named in speech and captions, not pixels.
      ...(request.media.kind === 'video' ? { media_resolution: 'MEDIA_RESOLUTION_LOW' } : {}),
    },
  };
}

/** Finish reasons that mean Gemini would not answer, which the gateway reports as a refusal. */
const REFUSED = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'IMAGE_SAFETY']);

export interface ParsedGemini {
  readonly text: string;
  readonly usage: TokenUsage;
  readonly refused: boolean;
  readonly finishReason: string | null;
}

/** Reads a `generateContent` response: its text, its tokens and whether it refused. */
export function parseGeminiResponse(body: unknown): ParsedGemini {
  const root = (body ?? {}) as {
    candidates?: {
      content?: { parts?: { text?: string; thought?: boolean }[] };
      finishReason?: string;
    }[];
    promptFeedback?: { blockReason?: string };
    usageMetadata?: {
      promptTokenCount?: number;
      cachedContentTokenCount?: number;
      candidatesTokenCount?: number;
      thoughtsTokenCount?: number;
    };
  };
  const candidate = root.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .filter((part) => part.thought !== true && typeof part.text === 'string')
    .map((part) => part.text)
    .join('');
  const meta = root.usageMetadata ?? {};
  const cached = meta.cachedContentTokenCount ?? 0;
  const finishReason = candidate?.finishReason ?? null;
  return {
    text,
    usage: {
      inputTokens: Math.max(0, (meta.promptTokenCount ?? 0) - cached),
      cacheWriteTokens: 0,
      cacheReadTokens: cached,
      // Thinking is billed as output.
      outputTokens: (meta.candidatesTokenCount ?? 0) + (meta.thoughtsTokenCount ?? 0),
    },
    refused:
      root.promptFeedback?.blockReason !== undefined ||
      (finishReason !== null && REFUSED.has(finishReason)) ||
      text.trimStart().startsWith(DECLINE_MARKER),
    finishReason,
  };
}

export function createGeminiVision(options: GeminiOptions): GeminiVision {
  const send = options.fetch ?? fetch;
  const now = options.now ?? (() => new Date());
  return {
    async call(route, request, context = {}) {
      if (!(await options.enabled())) throw toGatewayError(switchedOffError(GEMINI_VISION_KEY));
      try {
        await options.assertRouteOn?.(route);
      } catch (error) {
        throw toGatewayError(error);
      }
      const body = buildGeminiBody(request);
      const startedAt = now();
      const timeout = AbortSignal.timeout(options.timeoutMs ?? 90_000);
      let response: Response;
      try {
        response = await send(`${GEMINI_API_URL}/models/${GEMINI_MODEL}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': options.apiKey },
          body: JSON.stringify(body),
          signal: request.signal ? AbortSignal.any([request.signal, timeout]) : timeout,
        });
      } catch (error) {
        throw new GatewayError('AI_UNAVAILABLE', 'gemini unreachable', { cause: error });
      }
      if (!response.ok) {
        throw new GatewayError('AI_UNAVAILABLE', 'gemini request failed', {
          detail: { status: response.status, transient: RETRYABLE_STATUSES.has(response.status) },
          retryable: RETRYABLE_STATUSES.has(response.status),
        });
      }
      const parsed = parseGeminiResponse((await response.json()) as unknown);
      const endedAt = now();
      const costMicros = computeCostMicros('gemini', parsed.usage, endedAt);
      const traceId =
        context.langfuseTraceId ??
        options.telemetry?.recordGeneration({
          route,
          model: GEMINI_MODEL,
          tier: 'gemini',
          usage: parsed.usage,
          costMicros,
          startedAt,
          endedAt,
          stopReason: parsed.finishReason,
          userId: context.userId ?? null,
          tripId: context.tripId ?? null,
          crewId: context.crewId ?? null,
          jobId: context.jobId ?? null,
        }) ??
        null;
      // A refusal still bills its tokens, so the usage row is written before the error is raised.
      await options.onUsage?.(
        buildUsageRecord({
          route,
          model: GEMINI_MODEL,
          tier: 'gemini',
          usage: parsed.usage,
          costMicros,
          context: { ...context, langfuseTraceId: traceId },
          at: endedAt,
        }),
      );
      if (parsed.refused) {
        throw new GatewayError('AI_REFUSED', 'model declined the request', {
          detail: { route, category: parsed.finishReason },
        });
      }
      return { text: parsed.text, usage: parsed.usage, costMicros };
    },
  };
}
