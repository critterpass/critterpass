/**
 * The composer's draft with its reply and edit strips: `submit()` sends the text (or saves the
 * edit), `sendSticker()` sends a critter sticker, both as a reply when a reply strip is up. A
 * message that calls the guide by name (or `@tokek`) is flagged for it.
 */
import type { StickerPose } from '@cp/domain';
import { useCallback, useState } from 'react';

import type { ChatMessage } from '../../chat/data/rows';
import { useMessageActions } from '../../chat/data/use-message-actions';
import { useSendMessage } from '../../chat/data/use-send-message';

export function callsGuide(body: string, guideName: string | null): boolean {
  const lower = body.toLowerCase();
  return (
    /@tokek\b/iu.test(body) || (guideName !== null && lower.includes(`@${guideName.toLowerCase()}`))
  );
}

export function useChatDraft(crewId: string, guideName: string | null) {
  const { send, retry, discard } = useSendMessage(crewId);
  const actions = useMessageActions(crewId);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const clearReply = useCallback(() => setReplyTo(null), []);
  const replyFrom = replyTo === null ? {} : { reply_to: replyTo.id };

  const submit = () => {
    const body = draft.trim();
    if (body === '') return;
    if (editing !== null) {
      void actions.edit(editing, body);
      setEditing(null);
    } else {
      void send({
        body,
        mentions: [],
        mentions_guide: callsGuide(body, guideName),
        attachments: [],
        ...replyFrom,
      });
      setReplyTo(null);
    }
    setDraft('');
  };
  const sendSticker = (formId: string, pose: StickerPose) => {
    void send({
      body: '',
      mentions: [],
      mentions_guide: false,
      attachments: [],
      sticker: { form_id: formId, pose },
      ...replyFrom,
    });
    setReplyTo(null);
  };
  const cancelStrip = () => {
    if (editing !== null) setDraft('');
    setEditing(null);
    setReplyTo(null);
  };

  return {
    draft,
    setDraft,
    replyTo,
    setReplyTo,
    clearReply,
    editing,
    setEditing,
    submit,
    sendSticker,
    cancelStrip,
    retry,
    discard,
    actions,
  };
}
