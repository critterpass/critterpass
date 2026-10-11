/**
 * Every other invite state (offline, an unknown code, a referral link, a full crew, too many tries)
 * on the kit's empty state: what happened, Tokek's one line and the one way forward, with ✕ to leave.
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { View } from 'react-native';

import { Button, EmptyState, usePremiumTheme } from '@/ui/premium';
import { FullScreen } from '@/ui/premium/shell';

import { inviteProblemCopy, type InviteProblemKind } from '../../invited/invite-problem-copy';
import { withoutSeatRoute } from '../../invited/routes';

export function InviteProblemPage({
  kind,
  inviterFirstName,
  crewName,
  action,
}: {
  readonly kind: InviteProblemKind;
  readonly inviterFirstName: string | null;
  readonly crewName: string | null;
  readonly action?: { readonly label: string; readonly onPress: () => void } | undefined;
}) {
  const theme = usePremiumTheme();
  const copy = inviteProblemCopy(kind, inviterFirstName, crewName);
  return (
    <FullScreen
      closeLabel={t({ id: 'common.sheet.close', message: 'Close' })}
      overPhoto={false}
      onClose={() => router.replace(withoutSeatRoute())}
      testID={`invite-problem-${kind}`}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: theme.color.ground,
          justifyContent: 'center',
          paddingHorizontal: theme.space.titleGutter,
        }}
      >
        <EmptyState
          title={copy.title}
          line={copy.line}
          check={false}
          action={
            action === undefined ? undefined : (
              <Button label={action.label} onPress={action.onPress} size="medium" />
            )
          }
        />
      </View>
    </FullScreen>
  );
}
