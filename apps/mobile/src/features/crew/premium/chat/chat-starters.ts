/**
 * A brand-new chat's starters (5.02): each fills the composer with an opener (asking the guide
 * where it helps), and a crew of one also gets "Invite the crew".
 */
import { t } from '@lingui/core/macro';

import type { PremiumTheme } from '@/ui/premium';

import type { Starter } from './chat-panels';

export function chatStarters(
  th: PremiumTheme,
  prefill: (text: string) => void,
  invite: (() => void) | null,
): Starter[] {
  const starters: Starter[] = [
    {
      key: 'free',
      doodle: 'cal',
      color: th.accent.sky,
      label: t({ id: 'chat.premium.starter.free', message: 'When is everyone free?' }),
      onPress: () =>
        prefill(
          t({ id: 'chat.premium.starter.freeDraft', message: '@tokek when is everyone free?' }),
        ),
    },
    {
      key: 'place',
      doodle: 'temple',
      color: th.accent.tangerine,
      label: t({ id: 'chat.premium.starter.place', message: 'Pitch a place to go' }),
      onPress: () => prefill(t({ id: 'chat.premium.starter.placeDraft', message: 'What about ' })),
    },
    {
      key: 'budget',
      doodle: 'wallet',
      color: th.accent.mint,
      label: t({ id: 'chat.premium.starter.budget', message: 'Set a rough budget' }),
      onPress: () =>
        prefill(
          t({
            id: 'chat.premium.starter.budgetDraft',
            message: '@tokek help us set a rough budget',
          }),
        ),
    },
  ];
  if (invite === null) return starters;
  return [
    ...starters,
    {
      key: 'invite',
      doodle: 'chat',
      color: th.accent.pink,
      label: t({ id: 'chat.premium.starter.invite', message: 'Invite the crew' }),
      onPress: invite,
    },
  ];
}
