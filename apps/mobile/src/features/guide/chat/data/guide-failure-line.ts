/** What a guide turn says when it could not be answered (offline, a server error, a refusal). */
import { useLingui } from '@lingui/react/macro';

import { TURN_STOPPED } from './turn-state';

export function useFailureLine(code: string | null): string {
  const { t } = useLingui();
  switch (code) {
    case 'AI_REFUSED':
      return t({
        id: 'guide.error.refused',
        message: "That's not something I can help with. Ask me about the trip instead?",
      });
    case 'FAIR_USE_SLOWDOWN':
      return t({
        id: 'guide.error.busy',
        message: "I'm swamped right now. Give me a minute and ask again.",
      });
    case 'TOOL_UNAVAILABLE':
      return t({
        id: 'guide.error.cannotCheck',
        message: "I couldn't check that just now, so I won't guess.",
      });
    case TURN_STOPPED:
      return t({
        id: 'guide.error.stopped',
        message: 'Stopped there. Ask again whenever you like.',
      });
    case 'MODERATION_BLOCKED':
      return t({
        id: 'guide.error.moderation',
        message: "I can't answer that one. It didn't pass our safety check.",
      });
    case null:
    default:
      return t({
        id: 'guide.error.unavailable',
        message: 'I lost my train of thought. That one didn’t count.',
      });
  }
}
