/**
 * Sign out on the premium page (pushed from Settings › Account): a saved pass sees what leaves this
 * phone and that signing in brings it all back, as the delete page's two stickered cards; an unsaved
 * pass sees the warning first, saving it as the main action and signing out as the pink one it has
 * to choose on purpose.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { Button, Card, Skeleton, Tag, Text, usePremiumTheme } from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import type { SignOutViewProps } from '../../account/sign-out-view';

function Lines({ lines }: { readonly lines: readonly string[] }) {
  return (
    <Text variant="note" tone="inkSecondary" style={{ marginTop: 8 }}>
      {lines.join('\n')}
    </Text>
  );
}

export function SignOutPremiumView(props: SignOutViewProps) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const { saved } = props;
  return (
    <PushScreen
      title={t({ id: 'you.signOut.title', message: 'Sign out?' })}
      backLabel={t({ id: 'you.signOut.back', message: 'Settings' })}
      testID="you-sign-out"
    >
      <View style={{ paddingHorizontal: th.space.gutter, gap: th.space.gap10 }}>
        {saved === null ? (
          <View testID="you-sign-out-loading" style={{ gap: th.space.gap10 }}>
            <Skeleton height={96} radius={th.radius.card} />
            <Skeleton height={72} radius={th.radius.card} />
          </View>
        ) : null}
        {saved === true ? (
          <>
            <Card padded>
              <Tag
                label={t({ id: 'you.signOut.leaves', message: 'Leaves this phone' })}
                color={th.accent.pink}
                rotate={-3}
              />
              <Lines
                lines={[
                  t({ id: 'you.signOut.leaves.trips', message: 'Your trips, crews and chats' }),
                  t({
                    id: 'you.signOut.leaves.offline',
                    message: 'Trips saved offline, reminders and alarms',
                  }),
                ]}
              />
            </Card>
            <Card padded>
              <Tag
                label={t({ id: 'you.signOut.stays', message: 'Stays on your account' })}
                color={th.accent.mint}
                rotate={3}
              />
              <Lines
                lines={[
                  t({
                    id: 'you.signOut.stays.all',
                    message: 'All of it. Sign in again and everything comes back.',
                  }),
                ]}
              />
            </Card>
            <View style={{ marginTop: th.space.gap16 }}>
              <Button
                label={t({ id: 'you.signOut.confirm', message: 'Sign out' })}
                onPress={props.onSignOut}
                loading={props.busy}
                disabled={props.busy}
                testID="you-sign-out-confirm"
              />
            </View>
          </>
        ) : null}
        {saved === false ? (
          <>
            <Text
              variant="headline"
              color={th.color.destructive.text}
              accessibilityRole="header"
              testID="you-sign-out-warning"
            >
              {t({ id: 'you.signOut.unsavedTitle', message: 'This pass isn’t saved' })}
            </Text>
            <Text variant="body" tone="muted">
              {t({
                id: 'you.signOut.unsavedLine',
                message:
                  'Signing out erases it from this phone, and there is no way to sign back in. Save it with your phone number first and nothing is lost.',
              })}
            </Text>
            <View style={{ marginTop: th.space.gap16, gap: th.space.gap10 }}>
              <Button
                label={t({ id: 'you.signOut.savePass', message: 'Save my pass first' })}
                onPress={props.onSavePass}
                disabled={props.busy}
                testID="you-sign-out-save"
              />
              <Button
                label={t({
                  id: 'you.signOut.eraseAnyway',
                  message: 'Sign out and lose this pass',
                })}
                variant="destructive"
                onPress={props.onSignOut}
                loading={props.busy}
                disabled={props.busy}
                testID="you-sign-out-erase"
              />
            </View>
          </>
        ) : null}
        {props.problem === null ? null : (
          <Text
            variant="caption"
            color={th.color.destructive.helper}
            accessibilityRole="alert"
            testID="you-sign-out-problem"
          >
            {props.problem === 'restart_failed'
              ? t({
                  id: 'you.account.restartFailed',
                  message: 'This phone is cleared. Close the app and open it again.',
                })
              : t({
                  id: 'you.account.incomplete',
                  message: 'Some of this phone could not be cleared. Try again.',
                })}
          </Text>
        )}
      </View>
    </PushScreen>
  );
}
