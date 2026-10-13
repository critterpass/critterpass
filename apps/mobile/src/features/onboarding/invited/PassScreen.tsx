/**
 * 3a-12 "Your pass, three taps": the pass the inviter half-filled (marked FROM {INVITER}'S
 * CONTACTS), 1 a face, 2 how you travel (chips, prefilled from the tags the inviter confirmed), 3
 * ISSUE MY PASS. Issuing plays the pass page's stamp slam, the save sheet rises over it, and saving
 * (or "Not now") takes the seat. A join that could not be sent keeps the code and is sent again
 * from the same page; onboarding is finished only once the seat is taken or given up. A code joiner gets the same page without prefill: the sheet that
 * asks for a name and a home opens by itself, and until both are there the button asks for the
 * missing one instead of issuing.
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';

import { upper } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { AvatarPicker, guideSticker } from '@/ui/avatar';
import { PillButton } from '@/ui/buttons/PillButton';
import { GuideLine } from '@/ui/people/GuideLine';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { IssuedPage } from '../issued/IssuedScreen';
import { OnboardingPassCard } from '../pass-view';
import { SaveSheet } from '../save/SaveSheet';
import { EditPassSheet } from './EditPassSheet';
import { TravelChips } from './TravelChips';
import { passAskLabel } from './pass-missing';
import { PassJoinProblem } from './PassJoinProblem';
import { HANDOFF_ROUTES } from './routes';
import { useInvitePassStep } from './use-invite-pass-step';

const useStyles = makeStyles((th) => ({
  content: {
    paddingHorizontal: th.space['20'],
    gap: th.space['16'],
    paddingBottom: th.space['24'],
  },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footer: {
    paddingHorizontal: th.space['20'],
    paddingBottom: th.space['8'],
    gap: th.space['8'],
    alignItems: 'center',
  },
}));

export function PassScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const step = useInvitePassStep();
  const { session, draft, prefill, inviter, selected, guide, missing, editing, issued } = step;
  const { save, saved, focused } = step;
  const { joining, problem, join, giveUp } = step.seat;

  if (problem !== null) {
    return (
      <PassJoinProblem
        problem={problem}
        inviterFirstName={inviter || null}
        crewName={session.preview?.crew_name ?? null}
        onRetry={() => void join()}
        onHome={giveUp}
      />
    );
  }

  if (issued) {
    return (
      <>
        <IssuedPage
          choreography
          saved={saved}
          footer={
            joining ? (
              <PillButton
                label={t({ id: 'onboarding.invite.ticket.take', message: 'Take the seat' })}
                onPress={() => undefined}
                loading
                block
                testID="invite-pass-joining"
              />
            ) : null
          }
        />
        {saved || joining || !focused ? null : (
          <SaveSheet
            state={save.state}
            onApple={() => void save.apple()}
            onGoogle={() => void save.google()}
            onPhone={() => router.push(HANDOFF_ROUTES.phone)}
            onNotNow={() => void join()}
            onUseExisting={() => void save.confirmSwitch()}
            onKeepNew={save.keepThisPass}
            onKeptDone={save.closeKept}
            onReopenMerge={save.reopenMerge}
          />
        )}
      </>
    );
  }

  const tokek = guideSticker('tokek');
  const picked = selected.length;
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="invite-pass-screen">
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.top}>
          <BackEyebrow label={t({ id: 'onboarding.invite.pass.back', message: 'Ticket' })} />
          <Text variant="eyebrow" color={theme.semantic.state.success}>
            {upper(t({ id: 'onboarding.invite.pass.oneOfOne', message: '1 of 1' }), locale)}
          </Text>
        </View>
        <Text variant="h1" accessibilityRole="header">
          {upper(
            t({ id: 'onboarding.invite.pass.title', message: 'Your pass, three taps' }),
            locale,
          )}
        </Text>
        <Text variant="body" color={theme.semantic.text.secondary}>
          {prefill.givenName !== null
            ? t({
                id: 'onboarding.invite.pass.prefilled',
                message: `${inviter} filled in what they know. Change anything.`,
              })
            : t({
                id: 'onboarding.invite.pass.blank',
                message: 'Your name and your home airport, then you’re in the crew.',
              })}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t({
            id: 'onboarding.invite.pass.edit',
            message: 'Change your name or home',
          })}
          onPress={step.openEdit}
          testID="invite-pass-card"
        >
          <OnboardingPassCard draft={draft} />
        </Pressable>
        {prefill.givenName !== null ? (
          <Text variant="label" color={theme.semantic.state.urgent}>
            {upper(
              t({ id: 'onboarding.invite.pass.provenance', message: `From ${inviter}’s contacts` }),
              locale,
            )}
          </Text>
        ) : null}
        <Text variant="eyebrow">
          {upper(t({ id: 'onboarding.invite.pass.face', message: '1 · Your face' }), locale)}
        </Text>
        <AvatarPicker selected={guide} onPick={step.pickFace} testID="invite-pass-faces" />
        <Text variant="eyebrow">
          {upper(t({ id: 'onboarding.invite.pass.travel', message: '2 · How you travel' }), locale)}
        </Text>
        <TravelChips selected={selected} onToggle={step.toggle} />
        <GuideLine
          guide="tokek"
          name={tokek.name}
          sticker={<Sticker kind={tokek.kind} name={tokek.name} size={40} />}
          line={
            picked > 0 && prefill.tags.length > 0
              ? t({
                  id: 'onboarding.invite.pass.lineTags',
                  message: `${inviter} gave me a hint. I picked ${picked}.`,
                })
              : t({
                  id: 'onboarding.invite.pass.lineBlank',
                  message: 'Tap what sounds like you. I’ll plan around it.',
                })
          }
        />
      </ScrollView>
      <View style={styles.footer}>
        {missing === null ? (
          <PillButton
            label={upper(
              t({ id: 'onboarding.invite.pass.issue', message: '3 · Issue my pass' }),
              locale,
            )}
            tone="green"
            onPress={step.issue}
            block
            testID="invite-pass-issue"
          />
        ) : (
          <PillButton
            label={upper(passAskLabel(missing), locale)}
            tone="green"
            onPress={step.openEdit}
            block
            testID="invite-pass-ask"
          />
        )}
        <Text variant="bodySm" color={theme.semantic.text.secondary}>
          {t({
            id: 'onboarding.invite.pass.next',
            message: 'Next you’ll save it with Apple, Google or your number',
          })}
        </Text>
      </View>
      {editing ? (
        <EditPassSheet
          name={draft.given_name}
          homeIata={draft.home_iata}
          onClose={step.closeEdit}
          onDone={step.finishEdit}
        />
      ) : null}
    </Scaffold>
  );
}
