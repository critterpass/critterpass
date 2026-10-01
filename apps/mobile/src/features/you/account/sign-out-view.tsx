/**
 * Sign out (from Settings › Account). A saved pass is told what leaves the phone and that signing
 * in brings it back. An unsaved pass has no way back in, so it sees a warning first, with saving
 * the pass as the main action and signing out as the one it has to choose on purpose.
 */
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { Stack } from '@/ui/layout/Stack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Skeleton } from '@/ui/states/Skeleton';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { DotList, Problem } from './account-parts';

export interface SignOutViewProps {
  /** `null` while it is not yet known whether the pass is saved: nothing can be confirmed then. */
  readonly saved: boolean | null;
  readonly busy: boolean;
  /** The phone could not be fully cleared, or would not restart. */
  readonly problem: 'incomplete' | 'restart_failed' | null;
  readonly onSignOut: () => void;
  readonly onSavePass: () => void;
  readonly onBack?: () => void;
}

const useStyles = makeStyles((t) => ({
  content: { padding: t.size.gutter, paddingBottom: t.space['32'], gap: t.space['20'] },
  card: {
    backgroundColor: t.semantic.bg.raised,
    borderRadius: t.radius.lg,
    padding: t.size.cardInner.max,
    gap: t.space['14'],
  },
  divider: { height: 1, backgroundColor: t.color.divider },
}));

export function SignOutView(props: SignOutViewProps) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const { saved } = props;
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="you-sign-out">
      <ScrollView contentContainerStyle={styles.content}>
        <BackEyebrow
          label={t({ id: 'you.signOut.back', message: 'Settings' })}
          onPress={props.onBack}
          testID="you-sign-out-back"
        />
        <Text variant="h1" accessibilityRole="header">
          {t({ id: 'you.signOut.title', message: 'Sign out?' })}
        </Text>
        {saved === null ? <Skeleton preset="lines" testID="you-sign-out-loading" /> : null}
        {saved === true ? (
          <Stack gap="20">
            <View style={styles.card}>
              <DotList
                title={t({ id: 'you.signOut.leaves', message: 'Leaves this phone' })}
                color={theme.semantic.state.warning}
                lines={[
                  t({ id: 'you.signOut.leaves.trips', message: 'Your trips, crews and chats' }),
                  t({
                    id: 'you.signOut.leaves.offline',
                    message: 'Trips saved offline, reminders and alarms',
                  }),
                ]}
              />
              <View style={styles.divider} />
              <DotList
                title={t({ id: 'you.signOut.stays', message: 'Stays on your account' })}
                color={theme.semantic.state.success}
                lines={[
                  t({
                    id: 'you.signOut.stays.all',
                    message: 'All of it. Sign in again and everything comes back.',
                  }),
                ]}
              />
            </View>
            <PillButton
              label={t({ id: 'you.signOut.confirm', message: 'Sign out' })}
              onPress={props.onSignOut}
              loading={props.busy}
              disabled={props.busy}
              block
              testID="you-sign-out-confirm"
            />
          </Stack>
        ) : null}
        {saved === false ? (
          <Stack gap="20">
            <Text variant="h3" color={theme.semantic.state.urgent} testID="you-sign-out-warning">
              {t({ id: 'you.signOut.unsavedTitle', message: 'This pass isn’t saved' })}
            </Text>
            <Text variant="bodyLg" color={theme.semantic.text.secondary}>
              {t({
                id: 'you.signOut.unsavedLine',
                message:
                  'Signing out erases it from this phone, and there is no way to sign back in. Save it with your phone number first and nothing is lost.',
              })}
            </Text>
            <PillButton
              label={t({ id: 'you.signOut.savePass', message: 'Save my pass first' })}
              onPress={props.onSavePass}
              disabled={props.busy}
              block
              testID="you-sign-out-save"
            />
            <PillButton
              label={t({ id: 'you.signOut.eraseAnyway', message: 'Sign out and lose this pass' })}
              variant="destructive"
              onPress={props.onSignOut}
              loading={props.busy}
              disabled={props.busy}
              block
              testID="you-sign-out-erase"
            />
          </Stack>
        ) : null}
        {props.problem === null ? null : (
          <Problem
            testID="you-sign-out-problem"
            text={
              props.problem === 'restart_failed'
                ? t({
                    id: 'you.account.restartFailed',
                    message: 'This phone is cleared. Close the app and open it again.',
                  })
                : t({
                    id: 'you.account.incomplete',
                    message: 'Some of this phone could not be cleared. Try again.',
                  })
            }
          />
        )}
      </ScrollView>
    </Scaffold>
  );
}
