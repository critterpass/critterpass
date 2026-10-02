/**
 * The closed account page (3n-11): the EXIT stamp, when the account is erased, and the way back.
 * Three uses of one page:
 * - `closed`: straight after deleting. Keeping the account means signing in again, because closing
 *   signs every phone out; either button clears this phone.
 * - `erased`: an unsaved pass has nothing to sign back into, so there is only Close.
 * - `restore`: signed back in to a closed account; restoring reopens it as it was.
 */
import { format, upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { Stamp } from '@/ui/documents/Stamp';
import { PressScale } from '@/ui/press/PressScale';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { useNoBackByDesign } from '@/ui/qa/back-affordance';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { Problem } from './account-parts';

export type ClosedMode = 'closed' | 'erased' | 'restore';

export type ClosedProblem = 'incomplete' | 'restart_failed' | 'not_restored';

export interface ClosedViewProps {
  readonly mode: ClosedMode;
  /** When the account is erased (ISO); absent for `erased`. */
  readonly purgeAt: string | null;
  /** The day it was closed, printed on the stamp. */
  readonly closedOn: Date;
  readonly busy: boolean;
  readonly problem: ClosedProblem | null;
  /** `closed`: sign in again to keep it. `restore`: restore it now. */
  readonly onKeep?: () => void;
  readonly onClose: () => void;
}

/* eslint-disable lingui/no-unlocalized-strings -- Intl option values, never copy. */
const STAMP_DATE: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' };
const LONG_DATE: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
/* eslint-enable lingui/no-unlocalized-strings */

const useStyles = makeStyles((t) => ({
  content: {
    flexGrow: 1,
    padding: t.size.gutter,
    paddingBottom: t.space['32'],
    gap: t.space['20'],
  },
  stamp: { alignItems: 'center', paddingVertical: t.space['32'] },
  spacer: { flex: 1 },
  link: { minHeight: 44, justifyContent: 'center', paddingHorizontal: t.space['12'] },
}));

export function ClosedView(props: ClosedViewProps) {
  // The last page of the pass: there is nothing behind it to go back to.
  useNoBackByDesign();
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { mode } = props;
  const until =
    props.purgeAt === null ? null : format.date(locale, new Date(props.purgeAt), LONG_DATE);
  const title =
    mode === 'erased'
      ? t({ id: 'you.closed.erasedTitle', message: 'Account closed' })
      : mode === 'restore'
        ? t({ id: 'you.closed.restoreTitle', message: 'Welcome back' })
        : t({ id: 'you.closed.title', message: 'Closed for 30 days' });
  const body =
    mode === 'erased'
      ? t({
          id: 'you.closed.erasedBody',
          message:
            'This pass wasn’t saved, so there is nothing to sign back into. It is being erased now.',
        })
      : mode === 'restore'
        ? t({
            id: 'you.closed.restoreBody',
            message: `Your account is closed and will be erased on ${until ?? ''}. Restore it and your pass, critters and crews come back as they were.`,
          })
        : t({
            id: 'you.closed.body',
            message: `Nothing is erased until ${until ?? ''}. Sign in before then and your pass, critters and crews come back as they were.`,
          });
  // Paper ink: the quiet text link's secondary colour is for dark screens.
  const closeLabel =
    mode === 'restore'
      ? t({ id: 'you.closed.leave', message: 'Leave it closed' })
      : t({ id: 'you.closed.close', message: 'Close' });
  const problem =
    props.problem === 'not_restored'
      ? t({
          id: 'you.closed.notRestored',
          message: 'We couldn’t restore your account. Check your connection and try again.',
        })
      : props.problem === 'restart_failed'
        ? t({
            id: 'you.account.restartFailed',
            message: 'This phone is cleared. Close the app and open it again.',
          })
        : props.problem === 'incomplete'
          ? t({
              id: 'you.account.incomplete',
              message: 'Some of this phone could not be cleared. Try again.',
            })
          : null;
  return (
    <Scaffold variant="paper" edges={['top', 'bottom']} testID={`you-closed-${mode}`}>
      <ScrollView contentContainerStyle={styles.content}>
        <Row justify="space-between">
          <Text variant="monoData">
            {t({ id: 'you.closed.departures', message: 'DEPARTURES · DÉPARTS' })}
          </Text>
          <Text variant="monoData">{t({ id: 'you.closed.lastPage', message: 'LAST PAGE' })}</Text>
        </Row>
        <View style={styles.stamp}>
          <Stamp
            shape="rect"
            size={132}
            tilt={-6}
            ink={theme.color.blue}
            top={
              mode === 'restore'
                ? t({ id: 'you.closed.entry', message: 'ENTRY · ENTRÉE' })
                : t({ id: 'you.closed.exit', message: 'EXIT · SORTIE' })
            }
            title={
              mode === 'restore'
                ? upper(t({ id: 'you.closed.stampBack', message: 'Hello again' }), locale)
                : upper(t({ id: 'you.closed.stamp', message: 'See you' }), locale)
            }
            bottom={upper(format.date(locale, props.closedOn, STAMP_DATE), locale)}
            slam={mode !== 'restore'}
            testID="you-closed-stamp"
          />
        </View>
        <Stack gap="10">
          <Text variant="h2" accessibilityRole="header">
            {title}
          </Text>
          <Text variant="bodyLg" testID="you-closed-body">
            {body}
          </Text>
        </Stack>
        {problem === null ? null : <Problem testID="you-closed-problem" text={problem} />}
        <View style={styles.spacer} />
        <Stack gap="12" align="center">
          {props.onKeep && mode !== 'erased' ? (
            <PillButton
              label={
                mode === 'restore'
                  ? t({ id: 'you.closed.restore', message: 'Restore my account' })
                  : t({ id: 'you.closed.keep', message: 'Undo, keep my account' })
              }
              tone="ink"
              onPress={props.onKeep}
              loading={props.busy}
              disabled={props.busy}
              block
              testID="you-closed-keep"
            />
          ) : null}
          {mode === 'closed' ? (
            <Text variant="bodySm" color={theme.color.paper.muted}>
              {t({
                id: 'you.closed.keepHint',
                message: 'Closing signed you out everywhere, so keeping it means signing in again.',
              })}
            </Text>
          ) : null}
          <PressScale
            onPress={props.onClose}
            disabled={props.busy}
            widthClass="medium"
            accessibilityLabel={closeLabel}
            style={styles.link}
            testID="you-closed-close"
          >
            <Text variant="body" color={theme.color.paper.ink}>
              {closeLabel}
            </Text>
          </PressScale>
        </Stack>
      </ScrollView>
    </Scaffold>
  );
}
