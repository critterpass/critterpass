/**
 * "Your pass, three taps" on the premium pages (no render of its own; built on the 2.05 wizard
 * page and paper pass): the pass the inviter half-filled (FROM {INVITER}'S CONTACTS), 1 a face, 2
 * how you travel, 3 Issue my pass. Issuing plays 2.11's drop and ISSUED stamp, 2.12's save sheet
 * rises over it, and saving (or "Not now") takes the seat. A join that could not be sent is sent
 * again from its problem page. A code joiner gets the same page without prefill: the edit page
 * opens by itself, and until a name and a home are there the button asks for the missing one.
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { View } from 'react-native';

import { upper } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { GUIDE_AVATAR_IDS, guideSticker } from '@/ui/premium/stickers/guides';
import {
  Button,
  CritterSticker,
  GuideNote,
  PressableScale,
  ring,
  ROW_ROOM_ABOVE,
  ROW_ROOM_BELOW,
  ScrollRow,
  Text,
  usePremiumTheme,
} from '@/ui/premium';

import { guideFacts } from '../../guide-faces';
import { passAskLabel } from '../../invited/pass-missing';
import { HANDOFF_ROUTES } from '../../invited/routes';
import { useInvitePassStep } from '../../invited/use-invite-pass-step';
import { passFacts } from '../../pass-facts';
import { PassPaper } from '../components/PassPaper';
import { WizardPage } from '../components/WizardPage';
import { PremiumIssuedView } from '../issued/PremiumIssuedPage';
import { PremiumSaveSheet } from '../save/PremiumSaveSheet';
import { InvitePassEditPage } from './InvitePassEditPage';
import { InvitePassProblem } from './InvitePassProblem';
import { TravelTagChips } from './TravelTagChips';

function FacePicker({
  selected,
  onPick,
}: {
  readonly selected: string;
  readonly onPick: (id: (typeof GUIDE_AVATAR_IDS)[number]) => void;
}) {
  const theme = usePremiumTheme();
  return (
    <ScrollRow
      gap={theme.space.gap10}
      // 6 above and below the faces, as the row kept; its ring and shadow room sits inside.
      style={{
        marginTop: theme.space.gap6 - ROW_ROOM_ABOVE,
        marginBottom: theme.space.gap6 - ROW_ROOM_BELOW,
      }}
      accessibilityRole="radiogroup"
      testID="invite-pass-faces"
    >
      {GUIDE_AVATAR_IDS.map((id) => {
        const guide = guideSticker(id);
        const on = selected === id;
        return (
          <PressableScale
            key={id}
            onPress={() => onPick(id)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={guide.name}
            testID={`invite-pass-faces-${id}`}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: theme.color.card,
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: on ? ring(2.5, theme.color.ink) : theme.shadow.raised,
              }}
            >
              <CritterSticker kind={guide.kind} name={guide.name} seed={guide.seed} size={52} />
            </View>
          </PressableScale>
        );
      })}
    </ScrollRow>
  );
}

export function PremiumInvitePassPage() {
  const theme = usePremiumTheme();
  const locale = useLocale();
  const step = useInvitePassStep();
  const { session, draft, prefill, inviter, selected, missing, save, saved, focused } = step;
  const { joining, problem, join, giveUp } = step.seat;

  if (problem !== null) {
    return (
      <InvitePassProblem
        problem={problem}
        inviterFirstName={inviter || null}
        crewName={session.preview?.crew_name ?? null}
        onRetry={() => void join()}
        onHome={giveUp}
      />
    );
  }

  if (step.issued) {
    return (
      <View style={{ flex: 1 }}>
        <PremiumIssuedView
          choreography
          footer={
            joining ? (
              <Button
                label={t({ id: 'onboarding.invite.ticket.take', message: 'Take the seat' })}
                loading
                testID="invite-pass-joining"
              />
            ) : undefined
          }
        />
        {saved || joining || !focused ? null : (
          <PremiumSaveSheet
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
      </View>
    );
  }

  if (step.editing) {
    return (
      <InvitePassEditPage
        name={draft.given_name}
        homeIata={draft.home_iata}
        onClose={step.closeEdit}
        onDone={step.finishEdit}
      />
    );
  }

  const tokek = guideFacts('tokek');
  const picked = selected.length;
  return (
    <WizardPage
      step={{ current: 1, total: 1 }}
      backLabel={t({ id: 'onboarding.invite.pass.back', message: 'Ticket' })}
      onBack={() => router.back()}
      testID="invite-pass-screen"
      footer={
        <>
          {missing === null ? (
            <Button
              label={t({ id: 'onboarding.invite.pass.issue', message: '3 · Issue my pass' })}
              onPress={step.issue}
              testID="invite-pass-issue"
            />
          ) : (
            <Button
              label={passAskLabel(missing)}
              onPress={step.openEdit}
              testID="invite-pass-ask"
            />
          )}
          <Text variant="caption" tone="muted" align="center">
            {t({
              id: 'onboarding.invite.pass.next',
              message: 'Next you’ll save it with Apple, Google or your number',
            })}
          </Text>
        </>
      }
    >
      <View style={{ gap: theme.space.gap8 }}>
        <Text variant="largeTitle" accessibilityRole="header">
          {t({ id: 'onboarding.invite.pass.title', message: 'Your pass, three taps' })}
        </Text>
        <Text variant="body" tone="muted">
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
      </View>
      <PressableScale
        onPress={step.openEdit}
        accessibilityRole="button"
        accessibilityLabel={t({
          id: 'onboarding.invite.pass.edit',
          message: 'Change your name or home',
        })}
        pressedScale={0.98}
        testID="invite-pass-card"
      >
        <PassPaper facts={passFacts(draft, locale)} rotate={-1.5} />
      </PressableScale>
      {prefill.givenName !== null ? (
        <Text variant="badge" color={theme.color.status.tangerine.text}>
          {upper(
            t({ id: 'onboarding.invite.pass.provenance', message: `From ${inviter}’s contacts` }),
            locale,
          )}
        </Text>
      ) : null}
      <View style={{ gap: theme.space.gap8 }}>
        <Text variant="rowTitle">
          {t({ id: 'onboarding.invite.pass.face', message: '1 · Your face' })}
        </Text>
        <FacePicker selected={step.guide} onPick={step.pickFace} />
      </View>
      <View style={{ gap: theme.space.gap8 }}>
        <Text variant="rowTitle">
          {t({ id: 'onboarding.invite.pass.travel', message: '2 · How you travel' })}
        </Text>
        <TravelTagChips selected={selected} onToggle={step.toggle} />
      </View>
      <GuideNote
        name={tokek.name}
        critter={tokek.kind}
        text={
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
        testID="invite-pass-tokek"
      />
    </WizardPage>
  );
}
