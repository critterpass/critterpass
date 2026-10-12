/**
 * Every invite state that is not "take the seat", in the ticket's own place: Tokek, a title, one
 * line in his voice and the one way forward (retry, type a code, or start a pass without the
 * crew). Designed from the empty-state pattern (undesigned states, docs/undesigned-states.md).
 */
import { guideSticker } from '@/ui/avatar/guides';
import { Sticker } from '@/ui/sticker/Sticker';
import { EmptyState } from '@/ui/states/EmptyState';

import { inviteProblemCopy, type InviteProblemKind } from './invite-problem-copy';

export type { InviteProblemKind } from './invite-problem-copy';

export interface InviteProblemProps {
  readonly kind: InviteProblemKind;
  readonly inviterFirstName: string | null;
  readonly crewName: string | null;
  readonly action?: { readonly label: string; readonly onPress: () => void };
}

export function InviteProblem({ kind, inviterFirstName, crewName, action }: InviteProblemProps) {
  const tokek = guideSticker('tokek');
  const copy = inviteProblemCopy(kind, inviterFirstName, crewName);
  return (
    <EmptyState
      guide="tokek"
      guideName={tokek.name}
      sticker={<Sticker kind={tokek.kind} name={tokek.name} size={88} />}
      title={copy.title}
      line={copy.line}
      {...(action === undefined ? {} : { action })}
      testID={`invite-problem-${kind}`}
    />
  );
}
