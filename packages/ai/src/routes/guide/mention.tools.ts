/**
 * The guide's tools in crew chat: caller G, read and propose only. A mention turn runs as the
 * asker (`ToolContext.uid`), so every tool is authorised as them, never as another member.
 */
import type { ToolName } from '../../tools/schemas';
import { isProposeOnly, offeredTools } from './chat.tools';
import { CREW_MENTION_ROUTE } from './mention.prompt';

export function crewMentionTools(): ToolName[] {
  return offeredTools(CREW_MENTION_ROUTE);
}

/** Guards the mention route's contract: nothing it offers can act without a person confirming. */
export function assertMentionToolsProposeOnly(): void {
  if (!isProposeOnly(crewMentionTools())) {
    throw new Error('the crew mention route offers a tool that acts without a confirm');
  }
}
