/**
 * One Help problem's checklist (designed in code from the Help hub's parts): the problem's phrase
 * card on top, then each curated step with the one thing it lets the traveller do (GO, CALL, SHOW
 * IT, SHARE, ride quote, the guide, the ops desk). Offline it is built from synced rows and worded
 * from the app's own templates; online the guide's wording replaces them when it answers in time.
 */
import { helpProblemSchema, type ChecklistStep, type HelpProblem } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCommand } from '@/data/commands/use-command';
import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { pickPolicy, useInsurancePolicies, BOOKINGS_ROUTES } from '@/features/bookings';
import { hrefFor } from '@/lib/navigation/screen-registry';
import { feedback } from '@/motion';
import { Card } from '@/ui/cards/Card';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { ActionPill } from '@/ui/plan/ActionPill';
import { ConfirmSheet } from '@/ui/states/ConfirmSheet';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';
import { PhraseCard } from '@/ui/trip/PhraseCard';

import { requestOpsClinicCallCommand, startHelpShareCommand } from '../commands';
import { deviceHelpApi } from '../data/help-api';
import { useSpeech } from '../data/use-speech';
import { telUrl } from '../format';
import { stepText } from './checklist-copy';
import { checklistPhrase, localChecklist } from './checklist-model';
import { ShowIt } from './show-it';
import { useHelpHub } from './use-help-hub';
import { useStepActions, type StepAction } from './use-step-actions';

export function ChecklistScreen() {
  const { t, i18n } = useLingui();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ problem?: string; tripId?: string }>();
  const parsed = helpProblemSchema.safeParse(params.problem);
  const problem: HelpProblem = parsed.success ? parsed.data : 'hurt';
  const asked = typeof params.tripId === 'string' && params.tripId !== '' ? params.tripId : null;
  const hub = useHelpHub(deviceHelpApi, asked);
  useTripStreams(hub.tripId);
  const [server, setServer] = useState<readonly ChecklistStep[] | null>(null);
  const [showIt, setShowIt] = useState(false);
  const [askDesk, setAskDesk] = useState(false);
  const policy = pickPolicy(useInsurancePolicies().policies, hub.tripId);
  const clinic = useCommand(requestOpsClinicCallCommand);
  const share = useCommand(startHelpShareCommand);

  useEffect(() => {
    if (hub.tripId === null || !hub.located) return undefined;
    let live = true;
    void deviceHelpApi.checklist(hub.tripId, problem, hub.position).then((steps) => {
      if (live && steps !== null) setServer(steps);
    });
    return () => {
      live = false;
    };
  }, [hub.tripId, hub.located, hub.position, problem]);

  const steps = server ?? localChecklist(hub.model, problem);
  const phrase = checklistPhrase(hub.model, problem);
  const speech = useSpeech(phrase?.text ?? null, phrase?.language ?? null);
  const actionsFor = useStepActions({
    model: hub.model,
    assistancePhone: policy?.assistance_phone ?? null,
    hasPolicy: policy !== null,
    onShowPhrase: () => setShowIt(true),
    onAskDesk: () => setAskDesk(true),
    onShare: () => {
      if (hub.tripId === null) return;
      void share.send({ trip_id: hub.tripId, reason: 'help' }).then(() => feedback.emit('success'));
    },
    open: (target) => {
      if (target.kind === 'tel') void Linking.openURL(telUrl(target.number));
      else if (target.kind === 'insurance') router.push(BOOKINGS_ROUTES.insurance);
      else {
        const href = hrefFor(target.screen, {
          ...(hub.tripId === null ? {} : { tripId: hub.tripId }),
          ...target.params,
        });
        if (href !== undefined) router.push(href);
      }
    },
  });

  const titles: Readonly<Record<HelpProblem, string>> = {
    hurt: t({ id: 'safety.help.hurt', message: 'Hurt or sick' }),
    lost_stolen: t({ id: 'safety.help.lostStolen', message: 'Lost or stolen' }),
    lost: t({ id: 'safety.help.imLost', message: "I'm lost" }),
    missed_ride: t({ id: 'safety.help.missedRide', message: 'Missed a ride' }),
  };
  const deskText = t({
    id: 'safety.desk.consequence',
    message:
      'A person on the ops desk calls the clinic with you and tells them you may come in. Your insurance details stay with you.',
  });
  return (
    <Scaffold variant="dark" testID={`help-checklist-${problem}`}>
      <ScrollView
        contentContainerStyle={{
          padding: theme.size.gutter,
          paddingBottom: insets.bottom + theme.space['32'],
          gap: theme.space['16'],
        }}
      >
        <BackEyebrow label={t({ id: 'safety.back.help', message: 'Help' })} />
        <Text variant="h1" accessibilityRole="header">
          {titles[problem]}
        </Text>
        {phrase === null ? null : (
          <PhraseCard
            tone="paper"
            phrase={phrase.text}
            lang={phrase.language}
            translation={phrase.gloss}
            playing={speech.speaking}
            {...(speech.speak === null ? {} : { onPlay: speech.speak })}
            testID="checklist-phrase"
          />
        )}
        <Stack gap="10">
          {steps.map((step, index) => {
            const action: StepAction | null = actionsFor(step);
            return (
              <Card key={step.id} tone="raised" testID={`checklist-step-${step.kind}`}>
                <Row gap="12" align="center">
                  <Text variant="title" color={theme.semantic.text.secondary}>
                    {index + 1}
                  </Text>
                  <Stack flex={1}>
                    <Text variant="body">{stepText(step, i18n)}</Text>
                  </Stack>
                  {action === null ? null : (
                    <ActionPill
                      tone={action.tone}
                      label={action.label}
                      onPress={action.onPress}
                      testID={`checklist-action-${step.kind}`}
                    />
                  )}
                </Row>
              </Card>
            );
          })}
        </Stack>
      </ScrollView>
      {showIt && phrase !== null ? (
        <ShowIt
          phrase={phrase.text}
          lang={phrase.language}
          gloss={phrase.gloss}
          onClose={() => setShowIt(false)}
        />
      ) : null}
      {askDesk && hub.tripId !== null ? (
        <ConfirmSheet
          title={t({ id: 'safety.desk.title', message: 'Ops desk calls the clinic with you' })}
          consequences={[deskText]}
          confirmLabel={t({ id: 'safety.desk.confirm', message: 'Ask the desk' })}
          mode="button"
          onCancel={() => setAskDesk(false)}
          onConfirm={() => {
            setAskDesk(false);
            if (hub.tripId === null) return;
            const facility = hub.model.facility;
            void clinic
              .send({
                trip_id: hub.tripId,
                share_insurance: false,
                text_shown: deskText,
                ...(facility === null ? {} : { facility_id: facility.id }),
              })
              .then(() => feedback.emit('success'));
          }}
          testID="checklist-desk-confirm"
        />
      ) : null}
    </Scaffold>
  );
}
