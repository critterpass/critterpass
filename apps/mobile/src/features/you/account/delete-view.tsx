/**
 * Delete account (3n-9, then the last check of 3n-10 in place): what goes and what the crew
 * keeps, then a hold to confirm with an optional reason. The hold is the only way to delete, and
 * it is off while the phone is offline: the server must close the account before the phone is
 * cleared.
 */
import type { DeletionReason } from '@cp/domain';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useRef } from 'react';
import { ScrollView, View, type ScrollViewInstance } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { ChoiceChip } from '@/ui/chips/ChoiceChip';
import { HoldRing } from '@/ui/inputs/HoldRing';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { DotList, Problem } from './account-parts';

export type DeleteStep = 'review' | 'hold';

export type DeleteProblem =
  /** The server did not close the account: nothing on the phone was changed. */
  'not_closed';

export interface DeleteViewProps {
  readonly step: DeleteStep;
  readonly online: boolean;
  readonly busy: boolean;
  readonly passPlus: boolean;
  readonly reason: DeletionReason | null;
  readonly problem: DeleteProblem | null;
  readonly onContinue: () => void;
  readonly onReason: (reason: DeletionReason | null) => void;
  /** Called only when the hold completes. */
  readonly onDelete: () => void;
  readonly onKeep: () => void;
  readonly onBack?: () => void;
}

const useStyles = makeStyles((t) => ({
  content: { padding: t.size.gutter, paddingBottom: t.space['32'], gap: t.space['16'] },
  card: {
    backgroundColor: t.semantic.bg.raised,
    borderRadius: t.radius.lg,
    padding: t.size.cardInner.max,
    gap: t.space['14'],
  },
  divider: { height: 1, backgroundColor: t.color.divider },
  holdText: { flex: 1, minWidth: 0 },
}));

function useReasons(): readonly { readonly id: DeletionReason; readonly label: string }[] {
  const { t } = useLingui();
  /* eslint-disable lingui/no-unlocalized-strings -- reason ids on the wire, never copy. */
  return [
    { id: 'trips_over', label: t({ id: 'you.delete.reason.tripsOver', message: 'Trip’s over' }) },
    {
      id: 'too_many_pings',
      label: t({ id: 'you.delete.reason.pings', message: 'Too many pings' }),
    },
    {
      id: 'crew_moved_apps',
      label: t({ id: 'you.delete.reason.moved', message: 'Crew moved apps' }),
    },
    { id: 'privacy', label: t({ id: 'you.delete.reason.privacy', message: 'Privacy' }) },
    {
      id: 'something_else',
      label: t({ id: 'you.delete.reason.else', message: 'Something else' }),
    },
  ];
  /* eslint-enable lingui/no-unlocalized-strings */
}

export function DeleteView(props: DeleteViewProps) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const reasons = useReasons();
  const scroll = useRef<ScrollViewInstance>(null);
  const holdLabel = t({ id: 'you.delete.holdAction', message: 'Delete my account' });
  const closesLine = t({
    id: 'you.delete.closesLine',
    message:
      'Your account is closed now and erased after 30 days. Sign in before then and everything comes back.',
  });
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="you-delete">
      <ScrollView
        ref={scroll}
        contentContainerStyle={styles.content}
        // The last check opens below the lists: bring the hold into view with it.
        onContentSizeChange={() => {
          if (props.step === 'hold') scroll.current?.scrollToEnd({ animated: true });
        }}
      >
        <BackEyebrow
          label={t({ id: 'you.delete.back', message: 'Settings' })}
          onPress={props.onBack}
          testID="you-delete-back"
        />
        <Text variant="h1" accessibilityRole="header">
          {t({ id: 'you.delete.title', message: 'Delete your account?' })}
        </Text>
        <Text variant="body" color={theme.semantic.text.secondary}>
          {t({
            id: 'you.delete.lede',
            message: 'Here’s what goes with you, and what the crew keeps.',
          })}
        </Text>
        <View style={styles.card}>
          <DotList
            title={t({ id: 'you.delete.goes', message: 'Goes' })}
            color={theme.semantic.state.urgent}
            lines={[
              t({
                id: 'you.delete.goes.pass',
                message: 'Your pass, your critters and your stamps',
              }),
              t({
                id: 'you.delete.goes.profile',
                message: 'Your profile, uploads and chat messages',
              }),
            ]}
          />
          <View style={styles.divider} />
          <DotList
            title={t({ id: 'you.delete.keeps', message: 'The crew keeps' })}
            color={theme.semantic.state.success}
            lines={[
              t({
                id: 'you.delete.keeps.plans',
                message: 'Plans you helped make, shown as “former member”',
              }),
              t({
                id: 'you.delete.keeps.expenses',
                message: 'Expenses you added, so Balances still add up',
              }),
            ]}
          />
        </View>
        {props.passPlus ? (
          <Text
            variant="bodySm"
            color={theme.semantic.text.secondary}
            testID="you-delete-pass-plus"
          >
            {t({
              id: 'you.delete.passPlus',
              message:
                'Pass+ is billed by the store you bought it from. Deleting doesn’t cancel it, so cancel it there too.',
            })}
          </Text>
        ) : null}

        {props.step === 'review' ? (
          <PillButton
            label={t({ id: 'you.delete.continue', message: 'Continue' })}
            tone="pink"
            onPress={props.onContinue}
            block
            testID="you-delete-continue"
          />
        ) : (
          <Stack gap="14" testID="you-delete-hold-step">
            <Text variant="label" color={theme.semantic.state.urgent}>
              {t({ id: 'you.delete.lastCheck', message: 'Last check' })}
            </Text>
            <Text variant="h2" accessibilityRole="header">
              {t({ id: 'you.delete.holdTitle', message: 'Hold to delete' })}
            </Text>
            <Text variant="body" color={theme.semantic.text.secondary}>
              {closesLine}
            </Text>
            <Text variant="eyebrow">
              {t({ id: 'you.delete.why', message: 'Why are you leaving? Optional' })}
            </Text>
            <Row gap="8" wrap>
              {reasons.map((reason) => (
                <ChoiceChip
                  key={reason.id}
                  label={upper(reason.label, locale)}
                  selected={props.reason === reason.id}
                  onPress={() => props.onReason(props.reason === reason.id ? null : reason.id)}
                  tilt={0}
                  disabled={props.busy}
                  testID={`you-delete-reason-${reason.id}`}
                />
              ))}
            </Row>
            <Row gap="14">
              <HoldRing
                label={t({ id: 'you.delete.hold', message: 'Hold' })}
                actionLabel={holdLabel}
                confirmMessage={closesLine}
                tone="pink"
                onComplete={props.onDelete}
                disabled={!props.online || props.busy}
                testID="you-delete-hold"
              />
              <View style={styles.holdText}>
                <Text variant="h3">
                  {props.busy
                    ? t({ id: 'you.delete.closing', message: 'Closing your account…' })
                    : t({ id: 'you.delete.holdFor', message: 'Hold for 3 seconds' })}
                </Text>
                {props.online ? null : (
                  <Text
                    variant="bodySm"
                    color={theme.semantic.state.warning}
                    testID="you-delete-offline"
                  >
                    {t({
                      id: 'you.delete.offline',
                      message: 'You’re offline. Deleting needs a connection.',
                    })}
                  </Text>
                )}
              </View>
            </Row>
          </Stack>
        )}
        {props.problem === null ? null : (
          <Problem
            testID="you-delete-problem"
            text={t({
              id: 'you.delete.notClosed',
              message:
                'We couldn’t close your account, so nothing was changed on this phone. Try again in a moment.',
            })}
          />
        )}
        <TextLink
          label={t({ id: 'you.delete.keep', message: 'Keep my account' })}
          onPress={props.onKeep}
          disabled={props.busy}
          testID="you-delete-keep"
        />
      </ScrollView>
    </Scaffold>
  );
}
