/**
 * Home for a crew of one (undesigned; from the card, guide line and pill patterns, logged in
 * docs/undesigned-states.md): the guide says the crew is only its starter so far, and one button
 * opens the invite composer. It goes as soon as a second member joins.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';

import { useLocale } from '@/lib/i18n/use-locale';
import { guideSticker } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { Card } from '@/ui/cards/Card';
import { Stack } from '@/ui/layout/Stack';
import { GuideLine } from '@/ui/people/GuideLine';
import { Sticker } from '@/ui/sticker/Sticker';

import { crewInviteRoute } from './routes';

const GUIDE_PT = 48;

export function InviteFriendsCard({
  crewId,
  crewName,
}: {
  readonly crewId: string;
  readonly crewName: string;
}) {
  const { t } = useLingui();
  const locale = useLocale();
  const tokek = guideSticker('tokek');
  return (
    <Card testID="home-invite-friends">
      <Stack gap="16">
        <GuideLine
          guide="tokek"
          name={tokek.name}
          line={
            crewName === ''
              ? t({
                  id: 'home.invite.lineNoName',
                  message: 'It’s only you in the crew so far. Bring your friends in.',
                })
              : t({
                  id: 'home.invite.line',
                  message: `It’s only you in ${crewName} so far. Bring your friends in.`,
                })
          }
          sticker={<Sticker kind={tokek.kind} name={tokek.name} size={GUIDE_PT} pose="wave" />}
        />
        <PillButton
          label={upper(t({ id: 'home.invite.action', message: 'Invite friends' }), locale)}
          onPress={() => router.push(crewInviteRoute(crewId))}
          testID="home-invite-friends-open"
        />
      </Stack>
    </Card>
  );
}
