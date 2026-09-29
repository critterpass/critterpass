/**
 * The chat card for a `poll` message: reads the poll the message points at and draws it; a card
 * whose poll has not synced yet shows a quiet placeholder of the same size.
 */
import { useLingui } from '@lingui/react/macro';

import type { ChatCardProps } from '@/features/crew';
import { Skeleton } from '@/ui/states/Skeleton';

import { useMyUid } from '../data/use-my-uid';
import { usePoll } from '../data/use-poll';
import { PollCardBody } from './poll-card';

export function ChatPollCard({ message }: ChatCardProps) {
  const { t } = useLingui();
  const me = useMyUid();
  const { poll } = usePoll(message.refId, me);
  if (poll === null) {
    return (
      <Skeleton preset="card" label={t({ id: 'vote.poll.loading', message: 'Loading the poll' })} />
    );
  }
  return <PollCardBody poll={poll} askerName={message.senderName} />;
}
