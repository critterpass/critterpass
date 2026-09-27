/**
 * The tool registry: strict JSON-schema tool definitions per route, and execution of the model's
 * `tool_use` blocks through executors that the owning service modules register
 * (`registerToolExecutor(name, fn)`). Every call is checked against the surface's allow-list and
 * the tool's input schema, and every executor result against its output schema; a tool with no
 * executor, or one that fails, answers `TOOL_UNAVAILABLE` so the model says it cannot check
 * instead of guessing. Draft tools return ids only; nothing here mutates user-visible state.
 */
import type Anthropic from '@anthropic-ai/sdk';
import type { AiCaller, AiRoute } from '@cp/domain';
import { z } from 'zod';

import { resolveRoute, type RouteConfig } from '../routing';
import { allowedTools, isToolAllowed } from './allow-lists';
import { isToolName, TOOL_SPECS, type ToolInput, type ToolName, type ToolOutput } from './schemas';

/** JSON Schema keywords strict tool use accepts (structured-outputs JSON Schema limits). */
const SUPPORTED_FORMATS = new Set([
  'date-time',
  'time',
  'date',
  'duration',
  'email',
  'hostname',
  'uri',
  'ipv4',
  'ipv6',
  'uuid',
]);
const DROPPED_KEYWORDS = new Set([
  '$schema',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'pattern',
  'maxItems',
]);

function sanitise(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitise);
  if (node === null || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (DROPPED_KEYWORDS.has(key)) continue;
    if (key === 'format' && !SUPPORTED_FORMATS.has(String(value))) continue;
    if (key === 'minItems' && value !== 0 && value !== 1) continue;
    out[key] = key === 'properties' ? mapValues(value, sanitise) : sanitise(value);
  }
  if (out.type === 'object') out.additionalProperties = false;
  return out;
}

function mapValues(value: unknown, fn: (v: unknown) => unknown): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, fn(v)]),
  );
}

/**
 * zod → the JSON Schema subset strict tools accept. Constraints the grammar cannot express (ranges,
 * lengths, patterns) are dropped from the sent schema and still enforced by zod on every call.
 */
export function toStrictJsonSchema(schema: z.ZodType): Anthropic.Messages.Tool.InputSchema {
  const json = sanitise(z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }));
  return json as Anthropic.Messages.Tool.InputSchema;
}

export function toolDefinition(name: ToolName): Anthropic.Messages.Tool {
  const tool = TOOL_SPECS[name];
  return {
    name,
    description: tool.description,
    input_schema: toStrictJsonSchema(tool.input),
    strict: true,
  };
}

/** A tool this route may offer: on its caller's allow-list, and web search only where enabled. */
export function isRouteTool(route: RouteConfig, name: ToolName): boolean {
  return isToolAllowed(route.caller, name) && (name !== 'web_search' || route.webSearch);
}

/** Tool definitions for a route, in a fixed order so the tools cache layer stays byte-stable. */
export function routeTools(route: RouteConfig): Anthropic.Messages.Tool[] {
  return allowedTools(route.caller)
    .filter((name) => isRouteTool(route, name))
    .map(toolDefinition);
}

export interface ToolContext {
  readonly uid: string;
  readonly tripId: string | null;
  readonly caller: AiCaller;
  readonly route: AiRoute;
  readonly signal?: AbortSignal;
}

/** Executors may hand back readonly data; the output schema check copies it anyway. */
export type DeepReadonly<T> = T extends (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

export type ToolExecutor<N extends ToolName> = (
  input: ToolInput<N>,
  context: ToolContext,
) => Promise<DeepReadonly<ToolOutput<N>>>;

export type ToolFailure = 'TOOL_UNAVAILABLE' | 'TOOL_NOT_ALLOWED' | 'TOOL_INPUT_INVALID';

export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
}

export type ToolRunResult =
  | {
      readonly ok: true;
      readonly name: ToolName;
      readonly output: unknown;
      readonly block: Anthropic.Messages.ToolResultBlockParam;
    }
  | {
      readonly ok: false;
      readonly name: string;
      readonly failure: ToolFailure;
      readonly block: Anthropic.Messages.ToolResultBlockParam;
    };

const FAILURE_TEXT: Readonly<Record<ToolFailure, string>> = {
  TOOL_UNAVAILABLE:
    'TOOL_UNAVAILABLE: this check is not available right now. Tell the person you cannot check it; do not guess a value.',
  TOOL_NOT_ALLOWED: 'TOOL_NOT_ALLOWED: this tool is not available here. Answer without it.',
  TOOL_INPUT_INVALID: 'TOOL_INPUT_INVALID: the input did not match the tool schema.',
};

/** On a route that can search the web, an unavailable check points there instead of a dead end. */
const UNAVAILABLE_SEARCH_INSTEAD =
  'TOOL_UNAVAILABLE: this check is not available right now. Search the web for it instead, and say where what you found came from; do not guess a value.';

export interface ToolRegistry {
  registerToolExecutor<N extends ToolName>(name: N, executor: ToolExecutor<N>): void;
  hasExecutor(name: ToolName): boolean;
  execute(call: ToolCall, context: ToolContext): Promise<ToolRunResult>;
}

/** A tool call answered with a failure instead of running (the model is told why). */
export function toolFailure(
  call: ToolCall,
  failure: ToolFailure,
  options: { readonly searchInstead?: boolean } = {},
): ToolRunResult {
  const content =
    failure === 'TOOL_UNAVAILABLE' && options.searchInstead === true
      ? UNAVAILABLE_SEARCH_INSTEAD
      : FAILURE_TEXT[failure];
  return {
    ok: false,
    name: call.name,
    failure,
    block: {
      type: 'tool_result',
      tool_use_id: call.id,
      is_error: true,
      content,
    },
  };
}

export function createToolRegistry(
  onExecutorError?: (name: ToolName, error: unknown) => void,
): ToolRegistry {
  const executors = new Map<ToolName, ToolExecutor<ToolName>>();

  return {
    registerToolExecutor(name, executor) {
      if (executors.has(name)) throw new Error(`tool executor already registered: ${name}`);
      executors.set(name, executor);
    },
    hasExecutor: (name) => executors.has(name),
    async execute(call, context) {
      const route = { ...resolveRoute(context.route), caller: context.caller };
      const searchInstead = call.name !== 'web_search' && isRouteTool(route, 'web_search');
      const failed = (c: ToolCall, failure: ToolFailure) =>
        toolFailure(c, failure, { searchInstead });
      if (
        !isToolName(call.name) ||
        !isToolAllowed(context.caller, call.name) ||
        !isRouteTool(route, call.name)
      ) {
        return failed(call, 'TOOL_NOT_ALLOWED');
      }
      const name = call.name;
      const tool = TOOL_SPECS[name];
      const input = tool.input.safeParse(call.input);
      if (!input.success) return failed(call, 'TOOL_INPUT_INVALID');
      const executor = executors.get(name);
      if (executor === undefined) return failed(call, 'TOOL_UNAVAILABLE');
      let raw: unknown;
      try {
        raw = await executor(input.data, context);
      } catch (error) {
        onExecutorError?.(name, error);
        return failed(call, 'TOOL_UNAVAILABLE');
      }
      const output = tool.output.safeParse(raw);
      if (!output.success) {
        onExecutorError?.(name, output.error);
        return failed(call, 'TOOL_UNAVAILABLE');
      }
      return {
        ok: true,
        name,
        output: output.data,
        block: {
          type: 'tool_result',
          tool_use_id: call.id,
          content: tool.render?.(output.data) ?? JSON.stringify(output.data),
        },
      };
    },
  };
}
