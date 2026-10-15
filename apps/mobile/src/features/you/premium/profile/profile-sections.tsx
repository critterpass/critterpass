/**
 * The pass below its passport page (9.01): the stamp row (the next trip's stamp dashed until it
 * lands), how you travel with Retake, your crews, and the ways to the Critterdex and to inviting
 * friends.
 */
import { useLingui } from '@lingui/react/macro';
import { Pressable, View } from 'react-native';

import { tagWords } from '@/features/onboarding';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  CrewStack,
  EmptySlot,
  Icon,
  ListCard,
  RoundStamp,
  Row,
  Tag,
  Text,
  usePremiumTheme,
} from '@/ui/premium';

import { crewLineText, stampBottom, stampLabel } from '../../profile/profile-copy';
import type { ProfileModel } from '../../profile/profile-model';
import { memberAccent } from '../pass-paper';

const STAMP = 68;
const STAMP_TILTS = [-12, 8, -6, 10, -9];

function SectionHead(props: {
  readonly title: string;
  readonly action?: { label: string; onPress: () => void; testID: string } | undefined;
}) {
  const th = usePremiumTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        paddingHorizontal: th.space.titleGutter,
      }}
    >
      <Text variant="headline" accessibilityRole="header">
        {props.title}
      </Text>
      {props.action === undefined ? null : (
        <Pressable
          onPress={props.action.onPress}
          accessibilityRole="button"
          hitSlop={12}
          testID={props.action.testID}
        >
          <Text variant="label" tone="muted">
            {props.action.label}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

export interface ProfileSectionsProps {
  readonly model: ProfileModel;
  readonly onAllStamps: () => void;
  readonly onRetake: () => void;
  readonly onOpenCrew: (crewId: string) => void;
  readonly onStartCrew: () => void;
  readonly onCritterdex: () => void;
  readonly onInviteFriends: () => void;
}

export function ProfileSections(props: ProfileSectionsProps) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const { model } = props;
  const tagColours = [
    th.accent.sun,
    th.accent.pink,
    th.accent.sky,
    th.accent.mint,
    th.accent.paper,
  ];
  const onlyHome = model.stamps.every((stamp) => stamp.kind === 'home');

  return (
    <View style={{ gap: th.space.gap14, paddingTop: th.space.gap16 }}>
      <SectionHead
        title={t({ id: 'you.profile.stamps', message: 'Stamps' })}
        action={{
          label: t({ id: 'you.profile.allStamps', message: `All ${model.stampTotal} ›` }),
          onPress: props.onAllStamps,
          testID: 'you-profile-all-stamps',
        }}
      />
      <View
        style={{ flexDirection: 'row', gap: th.space.gap8, paddingHorizontal: th.space.gutter }}
        testID="you-profile-stamps"
      >
        {model.stamps.map((stamp, index) => (
          <View
            key={stamp.id}
            accessible
            accessibilityLabel={stampLabel(stamp, locale)}
            style={{
              width: STAMP,
              height: STAMP,
              borderRadius: STAMP / 2,
              backgroundColor: th.color.card,
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: th.shadow.raised,
              opacity: stamp.kind === 'upcoming' ? 0.7 : 1,
            }}
            testID={`you-profile-stamp-${stamp.kind}`}
          >
            <RoundStamp
              word={stamp.title.toLocaleUpperCase(locale)}
              {...(stampBottom(stamp, locale) === undefined
                ? {}
                : { bottom: (stampBottom(stamp, locale) ?? '').toLocaleUpperCase(locale) })}
              ink={stamp.kind === 'home' ? 'orange' : index % 2 === 0 ? 'pink' : 'green'}
              size={STAMP - 8}
              rotate={STAMP_TILTS[index % STAMP_TILTS.length] ?? 0}
            />
          </View>
        ))}
      </View>
      {onlyHome ? (
        <Text
          variant="caption"
          tone="muted"
          style={{ paddingHorizontal: th.space.titleGutter }}
          testID="you-profile-no-trips"
        >
          {t({
            id: 'you.profile.noTrips',
            message: 'Your first trip stamps itself here when you land.',
          })}
        </Text>
      ) : null}

      <SectionHead
        title={t({ id: 'you.profile.howYouTravel', message: 'How you travel' })}
        // Retake only once there is something to retake: before that the dashed slot asks.
        {...(model.tags.length === 0
          ? {}
          : {
              action: {
                label: t({ id: 'you.profile.retake', message: 'Retake' }),
                onPress: props.onRetake,
                testID: 'you-profile-retake',
              },
            })}
      />
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: th.space.gap8,
          paddingHorizontal: th.space.gutter,
        }}
      >
        {model.tags.map((tag, index) => (
          <Tag
            key={tag}
            label={tagWords(tag).full}
            color={tagColours[index % tagColours.length] ?? th.accent.sun}
            rotate={index % 2 === 0 ? -2 : 3}
          />
        ))}
        {model.tags.length === 0 ? (
          // No answers yet: a tag's dashed slot, which opens the this-or-that cards.
          <Pressable
            accessibilityRole="button"
            onPress={props.onRetake}
            testID="you-profile-no-tags"
          >
            <EmptySlot label={t({ id: 'you.profile.noTags', message: 'Answer six quick picks' })} />
          </Pressable>
        ) : null}
      </View>

      <SectionHead title={t({ id: 'you.profile.yourCrews', message: 'Your crews' })} />
      <View style={{ paddingHorizontal: th.space.gutter }}>
        <ListCard testID="you-profile-crews">
          {model.crews.map((crew) => (
            <Row
              key={crew.id}
              title={crew.name}
              subtitle={crewLineText(crew.line, locale)}
              leading={
                <CrewStack
                  members={crew.members.map((member) => ({
                    id: member.id,
                    name: member.name,
                    color: memberAccent(th, member.joinIndex),
                  }))}
                  max={3}
                  size={26}
                  accessibilityLabel={crew.members.map((member) => member.name).join(', ')}
                />
              }
              trailing={<Icon name="forward" size={16} color={th.color.placeholder} />}
              onPress={() => props.onOpenCrew(crew.id)}
              testID={`you-profile-crew-${crew.id}`}
            />
          ))}
          <Row
            title={t({ id: 'you.profile.startCrew', message: 'Start a crew' })}
            leading={<Icon name="plus" size={20} color={th.color.ink} />}
            onPress={props.onStartCrew}
            testID="you-profile-start-crew"
          />
        </ListCard>
      </View>

      <View style={{ paddingHorizontal: th.space.gutter }}>
        <ListCard>
          <Row
            title={t({ id: 'you.premium.critterdex', message: 'Critterdex' })}
            subtitle={t({
              id: 'you.premium.critterdexLine',
              message: 'Every local you have met',
            })}
            trailing={<Icon name="forward" size={16} color={th.color.placeholder} />}
            onPress={props.onCritterdex}
            testID="you-profile-critterdex"
          />
          <Row
            title={t({ id: 'you.premium.inviteFriends', message: 'Invite friends' })}
            subtitle={t({
              id: 'you.premium.inviteFriendsLine',
              message: 'Both of you get a stamp when they plan a trip',
            })}
            trailing={<Icon name="forward" size={16} color={th.color.placeholder} />}
            onPress={props.onInviteFriends}
            testID="you-profile-invite-friends"
          />
        </ListCard>
      </View>
    </View>
  );
}
