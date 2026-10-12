/**
 * The rooms step in the premium look (4.x rooms, 7.07–7.09), drawn from the same connected step as
 * the current one. Before a plan: the dates come first, then the organiser picks the stay (a member
 * waits). With a plan: the organiser sees the guide's rooms with Adjust (the drag editor) and Looks
 * good; a member sees their own room, everyone else's, a swap request and their room wishes. What
 * went wrong sits above the plan.
 */
import { useLingui } from '@lingui/react/macro';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { guideCritterKind, guideCritterName } from '@/features/trip';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  Banner,
  Button,
  Card,
  EmptyState,
  PressableScale,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';

import { dayRange } from '../../data/date-range';
import { memberLine, stayName } from '../../rooms/copy';
import type { RoomsView } from '../../rooms/rooms-view';
import { StepHeadline, StepPage } from '../steps/step-parts';
import { MemberRoom } from './member-room';
import { OrganiserPlan } from './organiser-plan';
import { useNoticeText } from './notice-text';
import { RoomsEditor } from './rooms-editor';

export const RoomsPremiumView: typeof RoomsView = ({ trip, model, actions }) => {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const [editing, setEditing] = useState(false);
  const notice = useNoticeText(model.notice);
  const guideName = guideCritterName(trip.guide);
  const guideInfo = { id: trip.guide, name: guideName };
  const guide = guideName;
  const organiser = trip.members.find((member) => member.organiser);
  const people = new Map(trip.members.map((member) => [member.uid, member]));
  const plan = model.plan;
  const editable = trip.isOrganiser;
  const solo = trip.isSolo || trip.members.length < 2;
  const ready = plan !== null && !model.stayUnavailable && trip.startDate !== null;
  const editStay = plan?.stays[0];
  const acceptsEvenSplit = plan === null && model.skippable;
  const subtitle =
    trip.startDate === null || trip.endDate === null
      ? undefined
      : dayRange(locale, trip.startDate, trip.endDate);
  const title = solo
    ? t({ id: 'setup.rooms.titleSolo', message: 'Where will you stay?' })
    : t({ id: 'setup.rooms.title', message: 'Who sleeps where?' });

  let body: ReactNode = null;
  if (trip.startDate === null) {
    body = (
      <StepHeadline
        title={title}
        line={t({
          id: 'setup.rooms.noDates',
          message: 'Rooms come once the dates are locked, so the nights add up.',
        })}
      />
    );
  } else if (plan === null || model.stayUnavailable) {
    body = (
      <>
        <StepHeadline
          title={title}
          line={
            editable
              ? model.stayUnavailable
                ? t({
                    id: 'setup.rooms.stayGone',
                    message: 'That stay isn’t on offer for these dates any more. Pick another.',
                  })
                : t({
                    id: 'setup.premium.rooms.pick',
                    message: `Pick where you’ll stay and ${guideName} splits the rooms.`,
                  })
              : t({
                  id: 'setup.rooms.waitingStay',
                  message: `${organiser?.name ?? ''} is picking the stay. The rooms show up here.`,
                })
          }
        />
        {editable && model.stays.length === 0 ? (
          <EmptyState
            critter={{ kind: guideCritterKind(trip.guide), name: guideName }}
            title={t({ id: 'setup.rooms.noStaysTitle', message: 'Rooms come with a stay' })}
            line={t({
              id: 'setup.rooms.noStaysLine',
              message: `Once a stay is booked, ${guide} splits the rooms. Until then everyone shares evenly.`,
            })}
            testID="setup-rooms-even"
          />
        ) : null}
        {editable
          ? model.stays.map(({ type, text: estimate, quotedIn: code }) => (
              <PressableScale
                key={type}
                onPress={() => actions.onPickStay(type)}
                accessibilityRole="button"
                testID={`setup-rooms-stay-option-${type}`}
              >
                <Card padded>
                  <Text variant="headline">{stayName(type)}</Text>
                  <Text variant="caption" tone="muted">
                    {code == null
                      ? t({
                          id: 'setup.rooms.estimate',
                          message: `About ${estimate} a room a night, estimate`,
                        })
                      : t({
                          id: 'setup.rooms.estimateQuoted',
                          message: `About ${estimate} a room a night, estimate in ${code}`,
                        })}
                  </Text>
                </Card>
              </PressableScale>
            ))
          : null}
      </>
    );
  } else if (editable) {
    body = (
      <OrganiserPlan
        plan={plan}
        tripStart={trip.startDate}
        guide={guideInfo}
        people={people}
        price={model.price}
        onSeparate={actions.onSeparate}
      />
    );
  } else if (editStay !== undefined) {
    body = (
      <>
        <StepHeadline title={title} line={memberLine(organiser?.name ?? '')} />
        <MemberRoom
          stay={editStay}
          currency={plan.currency}
          me={trip.me}
          organiser={organiser?.name ?? ''}
          people={people}
          price={model.price}
          chips={model.myChips}
          swapAsked={model.swapAsked}
          onToggleChip={actions.onToggleChip}
          onAskSwap={actions.onAskSwap}
        />
      </>
    );
  }

  const footer = editable ? (
    <>
      <View style={{ flexDirection: 'row', gap: th.space.gap10, alignSelf: 'stretch' }}>
        {ready && editStay !== undefined ? (
          <Button
            label={t({ id: 'setup.premium.rooms.adjust', message: 'Adjust' })}
            variant="secondary"
            onPress={() => setEditing(true)}
            testID="setup-rooms-adjust"
          />
        ) : null}
        <View style={{ flex: 1 }}>
          <Button
            label={t({ id: 'setup.rooms.lock', message: 'Looks good' })}
            onPress={acceptsEvenSplit ? actions.onSkip : actions.onLock}
            disabled={!acceptsEvenSplit && !ready}
            loading={model.locking}
            testID="setup-rooms-lock"
          />
        </View>
      </View>
      {model.skippable && !acceptsEvenSplit ? (
        <TextButton
          label={t({ id: 'setup.rooms.skip', message: 'Skip rooms' })}
          onPress={actions.onSkip}
          testID="setup-rooms-skip"
        />
      ) : null}
    </>
  ) : undefined;

  return (
    <StepPage
      title={plan === null ? title : stayName(plan.stays[0]?.type ?? '')}
      subtitle={subtitle}
      footer={footer}
      testID="setup-rooms"
    >
      {notice === null ? null : <Banner tone="error" text={notice} testID="setup-rooms-notice" />}
      {body}
      {editing && plan !== null && editStay !== undefined ? (
        <RoomsEditor
          tripId={trip.tripId}
          stay={editStay}
          currency={plan.currency}
          people={people}
          memberIds={trip.members.map((member) => member.uid)}
          onSave={actions.onMove}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </StepPage>
  );
};
