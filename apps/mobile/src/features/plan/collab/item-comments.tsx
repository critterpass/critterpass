/**
 * The item sheet's comments (anchored to a plan item): the thread with +1s, the guide's
 * undoable reply and who's typing, and a one-line composer that queues the comment.
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { View } from 'react-native';

import { useTyping } from '@/data/realtime/use-typing';
import { TextField } from '@/ui/inputs/TextField';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { ActionPill } from '@/ui/plan/ActionPill';

import { CommentThread } from './comment-thread';
import { useComments } from './use-comments';
import { PRESENCE_NAMESPACE } from './use-presence';
import { type DayItem } from '@/data/plan/plan-model';
import { type PlanMember } from '@/data/plan/use-trip-plan';

export function ItemComments({
  tripId,
  uid,
  item,
  members,
  guide,
}: {
  readonly tripId: string;
  readonly uid: string | null;
  readonly item: DayItem;
  readonly members: readonly PlanMember[];
  readonly guide: { readonly kind: string; readonly name: string };
}) {
  const { t } = useLingui();
  const comments = useComments(tripId, uid);
  const typing = useTyping(PRESENCE_NAMESPACE, tripId);
  const [draft, setDraft] = useState('');
  const send = () => {
    const body = draft;
    setDraft('');
    void comments.addComment({ kind: 'item', id: item.stableId }, body);
  };
  return (
    <Stack gap="8">
      <CommentThread
        title={item.title}
        comments={comments.thread([{ kind: 'item', id: item.stableId }])}
        members={members}
        uid={uid}
        typing={typing.typing}
        guide={guide}
        kept={comments.kept}
        now={comments.now}
        onPlusOne={(id, on) => void comments.plusOne(id, on)}
        onKeep={comments.keep}
        onUndo={(id) => void comments.undo(id)}
      />
      <Row gap="8" align="center">
        <View style={{ flex: 1 }}>
          <TextField
            label={t({ id: 'plan.collab.itemComposer', message: 'Add a comment' })}
            labelHidden
            value={draft}
            onChangeText={(text) => {
              setDraft(text);
              typing.notifyTyping();
            }}
            onSubmitEditing={send}
            returnKeyType="send"
            testID="plan-item-comment-field"
          />
        </View>
        <ActionPill
          label={t({ id: 'plan.collab.send', message: 'Send' })}
          tone="primary"
          disabled={draft.trim() === ''}
          onPress={send}
          testID="plan-item-comment-send"
        />
      </Row>
    </Stack>
  );
}
