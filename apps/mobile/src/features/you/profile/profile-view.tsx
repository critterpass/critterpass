/**
 * The profile (3n-1) as a pure view: back to Home, EDIT and SETTINGS pills, who you are, three
 * stats that count up, the stamps row, how you travel, your crews and the passport footer. A
 * control whose screen does not exist yet is left out (no handler), never shown dead.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { Pressable, ScrollView, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { ListCard } from '@/ui/cards/ListCard';
import { InfoPill } from '@/ui/chips/InfoPill';
import { StatusChip } from '@/ui/chips/StatusChip';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { AvatarStack } from '@/ui/people/AvatarStack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { HeaderPill, HeaderPills } from '@/ui/shell/HeaderPills';
import { Skeleton } from '@/ui/states/Skeleton';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { crewLineText, statLabel } from './profile-copy';
import { CREW_FACES, type ProfileModel } from './profile-model';
import { ProfileFace, SectionHead, StampRow, StatTile, Tags } from './profile-parts';

export interface ProfileViewProps {
  /** Null while the first read is still out. */
  readonly model: ProfileModel | null;
  readonly onBack?: () => void;
  readonly onEdit?: () => void;
  readonly onSettings?: () => void;
  readonly onAllStamps?: () => void;
  readonly onOpenCrew?: (crewId: string) => void;
  readonly onStartCrew?: () => void;
}

const useStyles = makeStyles((t) => ({
  content: { padding: t.size.gutter, paddingBottom: t.space['32'], gap: t.space['20'] },
  identity: { flex: 1, minWidth: 0, gap: t.space['4'] },
  footer: {
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: t.color.ink[600],
    paddingTop: t.space['12'],
  },
}));

export function ProfileView(props: ProfileViewProps) {
  const { model } = props;
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();

  const header = (
    <Row justify="space-between">
      <BackEyebrow
        label={t({ id: 'you.profile.back', message: 'Home' })}
        onPress={props.onBack}
        testID="you-profile-back"
      />
      <HeaderPills>
        {props.onEdit ? (
          <HeaderPill
            label={t({ id: 'you.profile.edit', message: 'Edit' })}
            onPress={props.onEdit}
            testID="you-profile-edit"
          />
        ) : null}
        {props.onSettings ? (
          <HeaderPill
            label={t({ id: 'you.profile.settings', message: 'Settings' })}
            onPress={props.onSettings}
            testID="you-profile-settings"
          />
        ) : null}
      </HeaderPills>
    </Row>
  );

  if (model === null) {
    return (
      <Scaffold variant="dark" edges={['top']} testID="you-profile">
        <View style={styles.content}>
          {header}
          <Skeleton preset="card" testID="you-profile-loading" />
          <Skeleton preset="list" />
        </View>
      </Scaffold>
    );
  }

  const handle = [model.username === null ? null : `@${model.username}`, model.homeCity]
    .filter((part): part is string => part !== null && part.length > 0)
    .join(' · ');
  const guideName = model.avatar.kind === 'guide' ? GUIDE_STICKERS[model.avatar.guide].name : null;
  const onlyHome = model.stamps.every((stamp) => stamp.kind === 'home');

  return (
    <Scaffold variant="dark" edges={['top']} testID="you-profile">
      <ScrollView contentContainerStyle={styles.content}>
        {header}

        <Row gap="14">
          <ProfileFace avatar={model.avatar} name={model.name} />
          <View style={styles.identity}>
            <Text variant="h1" accessibilityRole="header" testID="you-profile-name">
              {model.name}
            </Text>
            {handle.length > 0 ? (
              <Text
                variant="body"
                color={theme.semantic.text.secondary}
                testID="you-profile-handle"
              >
                {handle}
              </Text>
            ) : null}
            {model.passPlus || guideName !== null ? (
              <Row gap="8" wrap>
                {model.passPlus ? (
                  <StatusChip status="passPlus" testID="you-profile-pass-plus" />
                ) : null}
                {guideName !== null ? (
                  <InfoPill variant="outline" oneLine>
                    {upper(guideName, locale)}
                  </InfoPill>
                ) : null}
              </Row>
            ) : null}
          </View>
        </Row>

        <Row gap="8" align="stretch">
          <StatTile
            value={model.stats.trips}
            label={statLabel('trips', model.stats.trips)}
            color={theme.color.yellow}
            testID="you-profile-stat-trips"
          />
          <StatTile
            value={model.stats.countries}
            label={statLabel('countries', model.stats.countries)}
            color={theme.color.pink}
            testID="you-profile-stat-countries"
          />
          <StatTile
            value={model.stats.critters}
            label={statLabel('critters', model.stats.critters)}
            color={theme.color.green.base}
            testID="you-profile-stat-critters"
          />
        </Row>

        <Stack gap="10">
          <SectionHead
            title={t({ id: 'you.profile.stamps', message: 'Stamps' })}
            action={
              props.onAllStamps && model.stampTotal > model.stamps.length ? (
                <Pressable
                  onPress={props.onAllStamps}
                  accessibilityRole="button"
                  hitSlop={theme.space['12']}
                  testID="you-profile-all-stamps"
                >
                  <Text variant="label" color={theme.semantic.action.primary}>
                    {t({ id: 'you.profile.allStamps', message: `All ${model.stampTotal} ›` })}
                  </Text>
                </Pressable>
              ) : undefined
            }
          />
          <StampRow stamps={model.stamps} />
          {onlyHome ? (
            <Text
              variant="bodySm"
              color={theme.semantic.text.secondary}
              testID="you-profile-no-trips"
            >
              {t({
                id: 'you.profile.noTrips',
                message: 'Your first trip stamps itself here when you land.',
              })}
            </Text>
          ) : null}
        </Stack>

        {model.tags.length > 0 ? (
          <Stack gap="10">
            <SectionHead title={t({ id: 'you.profile.howYouTravel', message: 'How you travel' })} />
            <Tags tags={model.tags} />
          </Stack>
        ) : null}

        <Stack gap="10">
          <SectionHead title={t({ id: 'you.profile.yourCrews', message: 'Your crews' })} />
          {model.crews.map((crew) => (
            <ListCard
              key={crew.id}
              title={crew.name}
              subtitle={crewLineText(crew.line, locale)}
              leading={
                <AvatarStack
                  members={crew.members.map((member) => ({
                    key: member.id,
                    name: member.name,
                    joinIndex: member.joinIndex,
                  }))}
                  max={CREW_FACES}
                />
              }
              {...(props.onOpenCrew
                ? { onPress: () => props.onOpenCrew?.(crew.id) }
                : { chevron: false })}
              testID={`you-profile-crew-${crew.id}`}
            />
          ))}
          {model.crews.length === 0 ? (
            <ListCard
              title={t({ id: 'you.profile.startCrew', message: 'Start a crew' })}
              subtitle={t({
                id: 'you.profile.startCrewLine',
                message: 'Trips are better with your people.',
              })}
              {...(props.onStartCrew ? { onPress: props.onStartCrew } : { chevron: false })}
              testID="you-profile-start-crew"
            />
          ) : null}
        </Stack>

        <Row justify="space-between" style={styles.footer}>
          <Text variant="monoData" color={theme.semantic.text.secondary} testID="you-profile-mrz">
            {model.mrz}
          </Text>
          <Text variant="monoData" color={theme.semantic.text.secondary}>
            {t({ id: 'you.profile.since', message: `SINCE ${model.sinceYear}` })}
          </Text>
        </Row>
      </ScrollView>
    </Scaffold>
  );
}
