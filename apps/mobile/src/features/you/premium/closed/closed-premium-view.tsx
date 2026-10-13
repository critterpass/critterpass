/**
 * The closed account page in the premium look: the last page of the pass, with nothing behind it to
 * go back to. "DEPARTURES · DÉPARTS", the exit stamp landing once (the shell's stamp moment), when
 * the account is erased, and the way back. The same three uses as the current page: straight after
 * deleting (`closed`), an unsaved pass being erased (`erased`, only Close), and signed back in to a
 * closed account (`restore`, the entry stamp already there).
 */
import { format, upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import {
  Banner,
  Button,
  RoundStamp,
  StampMoment,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';
import { useNoBackByDesign } from '@/ui/qa/back-affordance';

import type { ClosedViewProps } from '../../account/closed-props';

/* eslint-disable lingui/no-unlocalized-strings -- Intl option values, never copy. */
const STAMP_DATE: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' };
const LONG_DATE: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
/* eslint-enable lingui/no-unlocalized-strings */

const STAGE = 240;

export function ClosedPremiumView(props: ClosedViewProps) {
  useNoBackByDesign();
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const insets = useSafeAreaInsets();
  const { mode } = props;
  // Leaving drops the exit stamp on the page once it is up; coming back finds the entry stamp.
  const [shown, setShown] = useState(mode === 'restore');
  useEffect(() => {
    if (shown) return undefined;
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, [shown]);
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
  const back = mode === 'restore';

  return (
    <View
      style={{ flex: 1, backgroundColor: th.color.ground, paddingTop: insets.top }}
      testID={`you-closed-${mode}`}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: th.space.gutter,
          paddingTop: th.space.gap12,
          paddingBottom: Math.max(insets.bottom, th.space.gap16),
          gap: th.space.gap14,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant="mono" tone="muted">
            {t({ id: 'you.closed.departures', message: 'DEPARTURES · DÉPARTS' })}
          </Text>
          <Text variant="mono" tone="muted">
            {t({ id: 'you.closed.lastPage', message: 'LAST PAGE' })}
          </Text>
        </View>
        <StampMoment
          landed={shown}
          ink={back ? 'green' : 'pink'}
          style={{ flex: 0, height: STAGE }}
          stamp={
            <RoundStamp
              word={
                back
                  ? t({ id: 'you.closed.stampBack', message: 'Hello again' })
                  : t({ id: 'you.closed.stamp', message: 'See you' })
              }
              top={
                back
                  ? t({ id: 'you.closed.entry', message: 'ENTRY · ENTRÉE' })
                  : t({ id: 'you.closed.exit', message: 'EXIT · SORTIE' })
              }
              bottom={upper(format.date(locale, props.closedOn, STAMP_DATE), locale)}
              ink={back ? 'green' : 'pink'}
              size={170}
              rotate={0}
              testID="you-closed-stamp"
            />
          }
        >
          <View style={{ flex: 1 }} />
        </StampMoment>
        <Text variant="largeTitle" accessibilityRole="header">
          {title}
        </Text>
        <Text variant="body" tone="inkSecondary" testID="you-closed-body">
          {body}
        </Text>
        {problem === null ? null : (
          <Banner tone="error" text={problem} testID="you-closed-problem" />
        )}
        <View style={{ flex: 1 }} />
        <View style={{ gap: th.space.gap10, alignItems: 'stretch' }}>
          {props.onKeep && mode !== 'erased' ? (
            <Button
              label={
                back
                  ? t({ id: 'you.closed.restore', message: 'Restore my account' })
                  : t({ id: 'you.closed.keep', message: 'Undo, keep my account' })
              }
              onPress={props.onKeep}
              loading={props.busy}
              disabled={props.busy}
              testID="you-closed-keep"
            />
          ) : null}
          {mode === 'closed' ? (
            <Text variant="captionMuted" tone="muted" align="center">
              {t({
                id: 'you.closed.keepHint',
                message: 'Closing signed you out everywhere, so keeping it means signing in again.',
              })}
            </Text>
          ) : null}
          <TextButton
            label={closeLabel}
            tone="muted"
            align="center"
            onPress={props.onClose}
            disabled={props.busy}
            testID="you-closed-close"
          />
        </View>
      </ScrollView>
    </View>
  );
}
