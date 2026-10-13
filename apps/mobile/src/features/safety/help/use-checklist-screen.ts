/**
 * One Help problem's checklist, shared by both looks: the problem, its phrase (when the traveller
 * cannot read it already), each curated step with the one thing it lets them do, the phrase shown
 * big, and asking the ops desk to call the clinic. Offline it is built from synced rows and worded
 * from the app's own templates; online the guide's wording replaces them when it answers in time.
 */
import {
  helpProblemSchema,
  type ChecklistStep,
  type HelpPhrase,
  type HelpProblem,
} from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { pickPolicy, useInsurancePolicies, BOOKINGS_ROUTES } from '@/features/bookings';
import { useLocale } from '@/lib/i18n/use-locale';
import { hrefFor } from '@/lib/navigation/screen-registry';
import { useCommandFeedback } from '@/motion/island-toast';

import { requestOpsClinicCallCommand, startHelpShareCommand } from '../commands';
import { deviceHelpApi } from '../data/help-api';
import { useOpsDesk } from '../data/use-ops-desk';
import { useSpeech } from '../data/use-speech';
import { telUrl } from '../format';
import {
  checklistPhrase,
  localChecklist,
  readsPhraseLanguage,
  withDesk,
  withPhrase,
} from './checklist-model';
import { useHelpHub } from './use-help-hub';
import { useStepActions, type StepAction } from './use-step-actions';

export interface ChecklistScreenState {
  readonly problem: HelpProblem;
  readonly title: string;
  readonly tripId: string | null;
  readonly phrase: HelpPhrase | null;
  readonly speech: ReturnType<typeof useSpeech>;
  readonly steps: readonly ChecklistStep[];
  readonly actionFor: (step: ChecklistStep) => StepAction | null;
  readonly showIt: boolean;
  readonly setShowIt: (show: boolean) => void;
  /** The "desk calls the clinic" question is showing. */
  readonly askDesk: boolean;
  readonly setAskDesk: (ask: boolean) => void;
  /** What the desk does, shown before asking and sent with the request. */
  readonly deskText: string;
  readonly sendDesk: () => void;
}

export interface ChecklistOptions {
  /** Asks about the ops desk its own way instead of raising `askDesk` (the premium alert). */
  readonly onAskDesk?: () => void;
}

export function useChecklistScreen(options: ChecklistOptions = {}): ChecklistScreenState {
  const { t } = useLingui();
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
  const { report } = useCommandFeedback();

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

  const desk = useOpsDesk();
  const locale = useLocale();
  const found = checklistPhrase(hub.model, problem);
  const phrase = found !== null && readsPhraseLanguage(locale, found.language) ? null : found;
  const steps = withPhrase(
    withDesk(server ?? localChecklist(hub.model, problem), desk),
    phrase !== null || found === null,
    // With no trip there is no crew to share a position with.
  ).filter((step) => hub.tripId !== null || step.kind !== 'share_pin');
  const speech = useSpeech(phrase?.text ?? null, phrase?.language ?? null);
  const actionsFor = useStepActions({
    model: hub.model,
    assistancePhone: policy?.assistance_phone ?? null,
    hasPolicy: policy !== null,
    onShowPhrase: () => setShowIt(true),
    onAskDesk: options.onAskDesk ?? (() => setAskDesk(true)),
    onShare: () => {
      if (hub.tripId === null) return;
      void share.send({ trip_id: hub.tripId, reason: 'help' }).then((result) =>
        report(result, {
          offlineCapable: true,
          id: 'checklist-share',
          done:
            result.kind === 'queued'
              ? t({
                  id: 'safety.checklist.shareQueued',
                  message: 'Your crew sees where you are the moment you have signal',
                })
              : t({ id: 'safety.checklist.shared', message: 'Your crew can see where you are' }),
        }),
      );
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
  const sendDesk = () => {
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
      .then((result) =>
        report(result, {
          offlineCapable: true,
          id: 'checklist-desk',
          done:
            result.kind === 'queued'
              ? t({
                  id: 'safety.desk.askedQueued',
                  message: 'The desk is asked the moment you have signal',
                })
              : t({ id: 'safety.desk.asked', message: 'The desk has been asked' }),
        }),
      );
  };
  return {
    problem,
    title: titles[problem],
    tripId: hub.tripId,
    phrase,
    speech,
    steps,
    actionFor: actionsFor,
    showIt,
    setShowIt,
    askDesk,
    setAskDesk,
    deskText,
    sendDesk,
  };
}
