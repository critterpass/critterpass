/**
 * What a member who left can do from the read-only bar (5.06): ask the organisers to let them back
 * in, or remove the kept chat from their phones after a confirmation (the crew keeps it).
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';

import { useToast } from '@/ui/premium';
import { confirmAlert } from '@/ui/premium/shell';

import { useKeptChat } from '../../chat/data/use-kept-chat';

export function useLeftChat(crewId: string) {
  const kept = useKeptChat(crewId);
  const toast = useToast();
  const onRejoin = () => {
    void kept.askToRejoin();
    toast.show({
      kind: 'done',
      message: t({ id: 'chat.premium.rejoinAsked', message: 'Asked the organisers' }),
    });
  };
  const onRemove = () =>
    void confirmAlert({
      title: t({ id: 'chat.premium.removeChat.title', message: 'Remove this chat?' }),
      message: t({
        id: 'chat.premium.removeChat.line',
        message: 'It leaves your phones. The crew keeps it.',
      }),
      confirm: t({ id: 'chat.premium.former.remove', message: 'Remove chat' }),
      cancel: t({ id: 'chat.premium.cancel', message: 'Cancel' }),
    }).then((yes) => {
      if (!yes) return;
      void kept.removeChat();
      router.back();
    });
  return { onRejoin, onRemove };
}
