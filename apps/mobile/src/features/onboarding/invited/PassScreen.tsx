/**
 * 3a-12 "Your pass, three taps": the pass the inviter half-filled (marked FROM {INVITER}'S
 * CONTACTS), 1 a face, 2 how you travel (chips, prefilled from the tags the inviter confirmed), 3
 * ISSUE MY PASS. Issuing plays the pass page's stamp slam, the save sheet rises over it, and saving
 * (or "Not now") takes the seat. A code joiner gets the same page without prefill: the sheet that
 * asks for a name and a home opens by itself, and until both are there the button asks for the
 * missing one instead of issuing.
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useContext, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { guideFormId, guideOfForm, homeBaseFor, type TasteTag } from '@cp/domain';
import { upper } from '@cp/i18n';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useAnalytics } from '@/lib/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { clearPendingLink } from '@/lib/links/pending';
import { AvatarPicker, GUIDE_STICKERS, type GuideAvatarId } from '@/ui/avatar';
import { PillButton } from '@/ui/buttons/PillButton';
import { GuideLine } from '@/ui/people/GuideLine';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { airportDataset, onboardingQuiz } from '../content';
import { markOnboardingComplete } from '../flow-controller/completion';
import { ensureDraft, updateDraft, usePassDraft } from '../flow-controller/draft-store';
import { IssuedPage } from '../issued/IssuedScreen';
import { OnboardingPassCard } from '../pass-view';
import { SaveSheet } from '../save/SaveSheet';
import { useSaveFlow } from '../save/use-save-flow';
import { EditPassSheet } from './EditPassSheet';
import { TravelChips } from './TravelChips';
import { InviteProblem } from './InviteProblem';
import { inviteSession, useInviteSession } from './invite-session';
import { acceptInvite, problemCardOf, type JoinProblem } from './join';
import { missingPassPart, passAskLabel } from './pass-missing';
import { answersForTags, applyPrefill, prefillOf } from './pass-prefill';
import { HANDOFF_ROUTES, INVITED_ROUTES } from './routes';

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
  const analytics = useAnalytics();
  const localFirst = useContext(LocalFirstContext);
  const session = useInviteSession();
  const draft = usePassDraft() ?? ensureDraft();
  const prefill = useMemo(() => prefillOf(session.preview), [session.preview]);
  const quiz = onboardingQuiz();
  const [selected, setSelected] = useState<TasteTag[]>(() => [...prefill.tags]);
  const [editing, setEditing] = useState(false);
  const [issued, setIssued] = useState(false);
  const [problem, setProblem] = useState<JoinProblem | null>(null);
  const save = useSaveFlow();
  const inviter = session.preview?.inviter_first_name ?? '';

  useEffect(() => {
    // Only a home the bundled airports know is kept from the hint.
    const home =
      prefill.homeIata !== null && homeBaseFor(airportDataset(), prefill.homeIata) !== null
        ? prefill.homeIata
        : null;
    const arrived = updateDraft((d) => applyPrefill(d, { ...prefill, homeIata: home }, quiz));
    // Nobody has to find the pass card to be asked for what the invite did not carry.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (missingPassPart(arrived) !== null) setEditing(true);
    // eslint-disable-next-line lingui/no-unlocalized-strings -- an analytics event name.
    if (prefill.givenName !== null) analytics.capture('invite_prefill_viewed', {});
    // Prefill once per page visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const guide: GuideAvatarId =
    draft.avatar?.kind === 'critter' ? (guideOfForm(draft.avatar.form_id) ?? 'tokek') : 'tokek';
  const pickFace = (next: GuideAvatarId) =>
    updateDraft((d) => ({ ...d, avatar: { kind: 'critter', form_id: guideFormId(next) } }));
  const toggle = (tag: TasteTag) => {
    const next = selected.includes(tag) ? selected.filter((x) => x !== tag) : [...selected, tag];
    setSelected(next);
    updateDraft((d) => ({
      ...d,
      answers: answersForTags(quiz, next),
      taste_done: next.length > 0,
    }));
  };
  const missing = missingPassPart(draft);

  const issue = () => {
    updateDraft((d) => ({
      ...d,
      avatar: d.avatar ?? { kind: 'critter', form_id: guideFormId('tokek') },
      taste_done: true,
      issued_at: new Date().toISOString(),
      step: 'issued',
    }));
    setIssued(true);
  };

  const join = async () => {
    const code = session.code;
    if (code === null || localFirst === null) {
      setProblem('offline');
      return;
    }
    const outcome = await acceptInvite(localFirst.commands, {
      code,
      ...(session.seat === null ? {} : { seat: session.seat }),
    });
    updateDraft((d) => ({ ...d, step: 'saved' }));
    markOnboardingComplete();
    clearPendingLink();
    if (outcome.kind === 'joined') {
      inviteSession.setJoined(outcome.result);
      router.replace(INVITED_ROUTES.manifest);
    } else setProblem(outcome.problem);
  };

  useEffect(() => {
    // Saving happens in the auth sheet; the seat is taken once it reports success.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (save.state.kind === 'saved') void join();
    // Joins once the pass is saved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save.state.kind]);

  if (problem !== null) {
    return (
      <Scaffold variant="dark" edges={['top', 'bottom']} testID="invite-pass-problem">
        <InviteProblem
          kind={problemCardOf(problem)}
          inviterFirstName={inviter || null}
          crewName={session.preview?.crew_name ?? null}
          action={{
            label: t({ id: 'onboarding.invite.pass.home', message: 'Go home' }),
            onPress: () => router.replace(HANDOFF_ROUTES.home),
          }}
        />
      </Scaffold>
    );
  }

  if (issued) {
    return (
      <>
        <IssuedPage choreography saved={save.state.kind === 'saved'} />
        {save.state.kind === 'saved' ? null : (
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

  const tokek = GUIDE_STICKERS.tokek;
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
          onPress={() => setEditing(true)}
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
        <AvatarPicker selected={guide} onPick={pickFace} testID="invite-pass-faces" />
        <Text variant="eyebrow">
          {upper(t({ id: 'onboarding.invite.pass.travel', message: '2 · How you travel' }), locale)}
        </Text>
        <TravelChips selected={selected} onToggle={toggle} />
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
            onPress={issue}
            block
            testID="invite-pass-issue"
          />
        ) : (
          <PillButton
            label={upper(passAskLabel(missing), locale)}
            tone="green"
            onPress={() => setEditing(true)}
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
          onClose={() => setEditing(false)}
          onDone={(next) => {
            updateDraft((d) => ({ ...d, given_name: next.name, home_iata: next.homeIata }));
            setEditing(false);
          }}
        />
      ) : null}
    </Scaffold>
  );
}
