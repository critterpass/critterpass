/**
 * The guide's tools (docs/api-contracts.md §6): input and output schemas, who may call each tool,
 * and whether it reads or drafts. Numbers, times and ids in outputs come from code (POI DB,
 * planner, cost engine, suppliers), never from the model. A draft tool never mutates anything a
 * user can see: it returns a draft or ChangeSet id a person confirms. `web_search` runs in our
 * code through a search provider (./web-search.ts) and is offered only on routes that enable it.
 */
import type { z } from 'zod';

import { DRAFT_TOOL_SPECS } from './draft-tools';
import { READ_TOOL_SPECS } from './read-tools';
import type { ToolSpec } from './tool-parts';
import { WEB_SEARCH_SPEC } from './web-search';

export type { ToolEffect, ToolSpec } from './tool-parts';

export const TOOL_SPECS = {
  ...READ_TOOL_SPECS,
  ...DRAFT_TOOL_SPECS,
  web_search: WEB_SEARCH_SPEC,
} as const satisfies Readonly<Record<string, ToolSpec>>;

export type ToolName = keyof typeof TOOL_SPECS;
export const TOOL_NAMES = Object.keys(TOOL_SPECS) as ToolName[];
export type ToolInput<N extends ToolName> = z.infer<(typeof TOOL_SPECS)[N]['input']>;
export type ToolOutput<N extends ToolName> = z.infer<(typeof TOOL_SPECS)[N]['output']>;

export function isToolName(name: string): name is ToolName {
  return Object.hasOwn(TOOL_SPECS, name);
}
