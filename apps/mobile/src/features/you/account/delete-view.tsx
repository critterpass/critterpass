/**
 * Delete account (3n-9, then the last check of 3n-10 in place): what goes and what the crew
 * keeps, then a hold to confirm with an optional reason. The hold is the only way to delete, and
 * it is off while the phone is offline: the server must close the account before the phone is
 * cleared.
 */
import type { DeletionPreflight, DeletionReason } from '@cp/domain';
import { upper } from '@cp/i18n';
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { useRef, useState } from 'react';
import { ScrollView, View, type ScrollViewInstance } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { ChoiceChip } from '@/ui/chips/ChoiceChip';
import { HoldRing } from '@/ui/inputs/HoldRing';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Sheet } from '@/ui/sheet/Sheet';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { ConfirmSheet } from '@/ui/states/ConfirmSheet';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { DotList, Problem } from './account-parts';
import { BillingNote, OwedCard, PreflightLines } from './preflight-parts';

export type DeleteStep = 'review' | 'hold';

export type DeleteProblem =
  /** The server did not close the account: nothing on the phone was changed. */
  'not_closed';

export interface DeleteViewProps {
  readonly step: DeleteStep;
  readonly online: boolean;
  readonly busy: boolean;
  readonly passPlus: boolean;
  /** The server's preflight; null until it answers (or when it cannot be reached). */
  readonly preflight: DeletionPreflight | null;
  readonly reason: DeletionReason | null;
  readonly problem: DeleteProblem | null;
  readonly onContinue: () => void;
  readonly onReason: (reason: DeletionReason | null) => void;
  /** Called only when the hold completes. */
  readonly onDelete: () => void;
  readonly onKeep: () => void;
  readonly onBack?: () => void;
  readonly onSettle?: () => void;
  readonly onManageSubscription?: () => void;
  /** "Download my data first", with the export's state under it. */
  readonly download?: { readonly line: string; readonly onPress: () => void };
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

const noop = () => undefined;

export function DeleteView(props: DeleteViewProps) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const reasons = useReasons();
  const scroll = useRef<ScrollViewInstance>(null);
  const holdLabel = t({ id: 'you.delete.holdAction', message: 'Delete my account' });
  const preflight = props.preflight;
  const closesLine =
    preflight?.instant === true
      ? t({
          id: 'you.delete.closesInstant',
          message: 'This pass isn’t saved, so it’s erased right away. There’s no way back to it.',
        })
      : t({
          id: 'you.delete.closesLine',
          message:
            'Your account is closed now and erased after 30 days. Sign in before then and everything comes back.',
        });
  const critters = preflight?.critters ?? null;
  const goesPass =
    critters === null || critters === 0
      ? t({ id: 'you.delete.goes.pass', message: 'Your pass, your critters and your stamps' })
      : t({
          id: 'you.delete.goes.passCount',
          message: plural(critters, {
            one: 'Your pass, your # critter and your stamps',
            other: 'Your pass, your # critters and your stamps',
          }),
        });
  const owed = (preflight?.balances ?? []).filter((b) => b.net_minor > 0);
  // The hold asked for without the gesture (a screen reader): the sheet asks before it commits.
  const [asking, setAsking] = useState<(() => void) | null>(null);
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
              goesPass,
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
        {owed.map((balance) => (
          <OwedCard
            key={`${balance.crew_id}-${balance.currency}`}
            balance={balance}
            onSettle={props.onSettle ?? noop}
          />
        ))}
        {preflight === null ? null : <PreflightLines preflight={preflight} />}
        <BillingNote
          source={preflight?.subscription?.source ?? null}
          passPlus={props.passPlus}
          onManage={props.onManageSubscription ?? null}
        />

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
                onConfirmRequest={(confirm) => setAsking(() => confirm)}
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
        {props.download === undefined || props.step !== 'review' ? null : (
          <Stack gap="2" align="center">
            <TextLink
              label={t({ id: 'you.delete.downloadFirst', message: 'Download my data first' })}
              onPress={props.download.onPress}
              disabled={props.busy}
              testID="you-delete-download"
            />
            <Text variant="caption" color={theme.semantic.text.secondary}>
              {props.download.line}
            </Text>
          </Stack>
        )}
        <TextLink
          label={t({ id: 'you.delete.keep', message: 'Keep my account' })}
          onPress={props.onKeep}
          disabled={props.busy}
          testID="you-delete-keep"
        />
      </ScrollView>
      {asking === null ? null : (
        <Sheet
          detents={['fit']}
          onDismiss={() => setAsking(null)}
          accessibilityLabel={holdLabel}
          testID="you-delete-confirm"
        >
          <Stack padding="16">
            <ConfirmSheet
              title={holdLabel}
              consequences={[closesLine]}
              confirmLabel={holdLabel}
              onConfirm={() => {
                setAsking(null);
                asking();
              }}
              onCancel={() => setAsking(null)}
              testID="you-delete-confirm-ask"
            />
          </Stack>
        </Sheet>
      )}
    </Scaffold>
  );
}
