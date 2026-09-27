/**
 * Per-surface tool allow-lists (docs/api-contracts.md §6 "Callers"): C guide chat 1:1, G guide in
 * crew chat, D drafting/redraft jobs, R replan/disruption/watch jobs, B briefing/roundup/quests/
 * recap jobs, M parsers. Derived from each tool's `callers`, so a tool is offered to exactly the
 * surfaces its row names. Parsers (M) get nothing: they read documents and return structured output.
 */
import { AI_CALLERS, type AiCaller } from '@cp/domain';

import { TOOL_NAMES, TOOL_SPECS, type ToolName } from './schemas';

/** Anthropic-executed tools and their callers (the guest guide and event/closure checks). */
export const SERVER_TOOL_CALLERS = { web_search: ['C', 'R'] } as const satisfies Readonly<
  Record<string, readonly AiCaller[]>
>;
export type ServerToolName = keyof typeof SERVER_TOOL_CALLERS;

export const TOOL_ALLOW_LISTS: Readonly<Record<AiCaller, readonly ToolName[]>> = Object.fromEntries(
  AI_CALLERS.map((caller) => [
    caller,
    caller === 'M'
      ? []
      : TOOL_NAMES.filter((name) =>
          (TOOL_SPECS[name].callers as readonly string[]).includes(caller),
        ),
  ]),
) as unknown as Record<AiCaller, readonly ToolName[]>;

/** Tools a surface may be offered; `null` (a route with no caller class) gets none. */
export function allowedTools(caller: AiCaller | null): readonly ToolName[] {
  return caller === null ? [] : TOOL_ALLOW_LISTS[caller];
}

export function isToolAllowed(caller: AiCaller | null, name: string): boolean {
  return (allowedTools(caller) as readonly string[]).includes(name);
}

export function isServerToolAllowed(caller: AiCaller | null, name: ServerToolName): boolean {
  return caller !== null && (SERVER_TOOL_CALLERS[name] as readonly AiCaller[]).includes(caller);
}
