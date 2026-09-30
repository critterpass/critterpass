/**
 * The guide sheet's tools: caller C of docs/api-contracts.md §6, as the `guide.chat` route offers
 * them (web search included where the route enables it). Every tool reads or drafts; none mutates
 * anything a person can see without confirming it.
 */
import { resolveRoute } from '../../routing';
import { routeTools } from '../../tools/registry';
import { TOOL_SPECS, type ToolName } from '../../tools/schemas';

export const GUIDE_CHAT_ROUTE = 'guide.chat' as const;

/** Tool names a route offers, in the byte-stable order the request sends them. */
export function offeredTools(route: Parameters<typeof resolveRoute>[0]): ToolName[] {
  return routeTools(resolveRoute(route)).map((tool) => tool.name as ToolName);
}

export function guideChatTools(): ToolName[] {
  return offeredTools(GUIDE_CHAT_ROUTE);
}

/** Every tool reads or returns a draft a person confirms. */
export function isProposeOnly(names: readonly ToolName[]): boolean {
  return names.every(
    (name) => TOOL_SPECS[name].effect === 'read' || TOOL_SPECS[name].effect === 'draft',
  );
}
