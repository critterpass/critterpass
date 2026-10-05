/**
 * What the trip map tells an organiser about her own plan before the crew has seen one
 * (undesigned, logged). While she is building it on the trip's days: only she sees it, the guide
 * can draft the rest around what she placed, and once a stop is on it she can send it as it is.
 * While the guide is drafting: her days open again when it is done. Once there is a draft to
 * review: the way to the review.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { reviewHandPlanOnline } from '@/data/plan/commands';
import { toast } from '@/motion/island-toast';
import { TextLink } from '@/ui/buttons/TextLink';
import { TokekNote } from '@/ui/planning';

import { draftRoutes } from '../draft/routes';
import { planRoutes } from '../overview/routes';
import { GuideSticker } from './guide-sticker';

import type { TripMapModel } from './sheet-props';

const NOT_SENT_ID = 'plan-hand-plan-not-sent';

export function DraftNote({ model }: { readonly model: TripMapModel }) {
  const { t } = useLingui();
  const send = useCommand(reviewHandPlanOnline);
  const [sending, setSending] = useState(false);
  const stage = model.draftStage;
  if (!model.draft || stage === undefined) return null;
  const guide = model.guide.name;
  const tripId = model.tripId;
  const stops = model.days.reduce((sum, day) => sum + day.stops.length, 0);
  const note = (line: string, label: string, onPress: () => void) => (
    <TokekNote
      guide={model.guide.id}
      sticker={<GuideSticker guide={model.guide.id} />}
      name={guide}
      line={line}
      action={{ label, onPress }}
      testID="trip-map-draft"
    />
  );
  if (stage === 'review') {
    return note(
      t({
        id: 'plan.tripMap.draftOnly',
        message: 'This is your draft. Only you can see it until you send it.',
      }),
      t({ id: 'plan.tripMap.draftReview', message: 'Review' }),
      () => router.push(planRoutes.draft(tripId)),
    );
  }
  if (stage === 'guideWorking') {
    return note(
      t({
        id: 'plan.tripMap.draftWorking',
        message: 'I’m drafting. Your days open again when I’m done.',
      }),
      t({ id: 'plan.tripMap.draftWatch', message: 'Watch' }),
      () => router.push(draftRoutes.drafting(tripId)),
    );
  }
  const onSend = async () => {
    if (model.draftVersionId == null) return;
    setSending(true);
    const result = await send.send({ trip_id: tripId, base_version: model.draftVersionId });
    setSending(false);
    if (result.kind === 'applied') {
      router.push(planRoutes.draft(tripId));
      return;
    }
    toast.show({
      id: NOT_SENT_ID,
      title: t({ id: 'plan.tripMap.sendAsIsFailed', message: 'Couldn’t open the review yet' }),
      subtitle: t({
        id: 'plan.tripMap.sendAsIsFailedLine',
        message: 'Your last change may still be saving. Try again with signal.',
      }),
    });
  };
  return (
    <View>
      {note(
        stops === 0
          ? t({
              id: 'plan.tripMap.daysOnly',
              message:
                'These are your days. Only you see them. Add stops yourself, or I’ll draft them.',
            })
          : t({
              id: 'plan.tripMap.daysStarted',
              message: 'Only you see this so far. I can draft the rest around your stops.',
            }),
        stops === 0
          ? t({ id: 'plan.tripMap.draftIt', message: 'Draft it' })
          : t({ id: 'plan.tripMap.draftRest', message: 'Draft the rest' }),
        () => router.push(draftRoutes.drafting(tripId)),
      )}
      {stops === 0 ? null : (
        <TextLink
          label={t({ id: 'plan.tripMap.sendAsIs', message: 'Send it as it is' })}
          onPress={() => void onSend()}
          disabled={sending}
          testID="trip-map-send-as-is"
        />
      )}
    </View>
  );
}
