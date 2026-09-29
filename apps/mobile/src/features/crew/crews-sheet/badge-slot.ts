/**
 * The crew card's chat slot: crew chat registers two hooks, a crew's unread count and its last
 * message, and the crews sheet draws the "N NEW" pill and the preview line from them. Until chat
 * registers, cards show neither. Registration happens once at start-up, so the hooks are called
 * in the same order on every render.
 */
export interface CrewLastMessage {
  /** First name of the crewmate or guide who sent it. */
  readonly sender: string;
  readonly kind: 'text' | 'photo' | 'voice';
  /** The text, for a text message. */
  readonly body: string;
}

export interface CrewCardChat {
  readonly useUnread: (crewId: string) => number;
  readonly useLastMessage: (crewId: string) => CrewLastMessage | null;
}

let chat: CrewCardChat | null = null;

export function registerCrewCardChat(next: CrewCardChat): () => void {
  chat = next;
  return () => {
    if (chat === next) chat = null;
  };
}

export function crewCardChat(): CrewCardChat | null {
  return chat;
}
