/**
 * The profile (3n-1) as a pure view: back to Home, EDIT and SETTINGS pills, who you are, three
 * stats that count up, the stamps row, how you travel, your crews and the passport footer. A
 * control whose screen does not exist yet is left out (no handler), never shown dead.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { PrivateContent } from '@/features/help';
import { useLocale } from '@/lib/i18n/use-locale';
import { guideSticker } from '@/ui/avatar/guides';
import { InfoPill } from '@/ui/chips/InfoPill';
import { StatusChip } from '@/ui/chips/StatusChip';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { HeaderPill, HeaderPills } from '@/ui/shell/HeaderPills';
import { Skeleton } from '@/ui/states/Skeleton';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { statLabel } from './profile-copy';
import type { ProfileModel } from './profile-model';
import { CrewRows } from './crew-rows';
import { ProfileFace, SectionHead, StampRow, StatTile, Tags } from './profile-parts';

export interface ProfileViewProps {
  /** Null while the first read is still out. */
  readonly model: ProfileModel | null;
  /** Which screen the back control names. @default 'home' */
  readonly from?: 'home' | 'pass';
  readonly onBack?: () => void;
  readonly onEdit?: () => void;
  readonly onSettings?: () => void;
  readonly onAllStamps?: () => void;
  /** HOW YOU TRAVEL's RETAKE: the this-or-that quiz again. */
  readonly onRetake?: () => void;
  /** GET PASS+ for a free pass: opens the plans screen. */
  readonly onGetPassPlus?: () => void;
  /** The Pass+ chip of a Pass+ holder: opens Your plan. */
  readonly onPlan?: () => void;
  /** The person's own photo link, when they wear a photo. */
  readonly photoUri?: string | null;
  readonly onOpenCrew?: (crewId: string) => void;
  readonly onStartCrew?: () => void;
  /** A notice above the profile (a failed Pass+ renewal); draws nothing when there is none. */
  readonly notice?: ReactNode;
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
        label={
          props.from === 'pass'
            ? t({ id: 'you.profile.backPass', message: 'Pass' })
            : t({ id: 'you.profile.back', message: 'Home' })
        }
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
  const guideName = model.avatar.kind === 'guide' ? guideSticker(model.avatar.guide).name : null;
  const onlyHome = model.stamps.every((stamp) => stamp.kind === 'home');

  return (
    <Scaffold variant="dark" edges={['top']} testID="you-profile">
      <ScrollView contentContainerStyle={styles.content}>
        {header}
        {props.notice}

        <Row gap="14">
          <ProfileFace
            avatar={model.avatar}
            name={model.name}
            ring={model.ring}
            photoUri={props.photoUri ?? null}
          />
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
            {model.passPlus || guideName !== null || props.onGetPassPlus ? (
              <Row gap="8" wrap>
                {model.passPlus ? (
                  props.onPlan ? (
                    <Pressable
                      onPress={props.onPlan}
                      accessibilityRole="button"
                      hitSlop={theme.space['8']}
                      testID="you-profile-plan"
                    >
                      <StatusChip status="passPlus" testID="you-profile-pass-plus" />
                    </Pressable>
                  ) : (
                    <StatusChip status="passPlus" testID="you-profile-pass-plus" />
                  )
                ) : props.onGetPassPlus ? (
                  <Pressable
                    onPress={props.onGetPassPlus}
                    accessibilityRole="button"
                    hitSlop={theme.space['8']}
                    testID="you-profile-get-pass-plus"
                  >
                    <InfoPill variant="outline" oneLine>
                      {upper(t({ id: 'you.profile.getPassPlus', message: 'Get Pass+' }), locale)}
                    </InfoPill>
                  </Pressable>
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
              props.onAllStamps ? (
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

        {model.tags.length > 0 || props.onRetake ? (
          <Stack gap="10">
            <SectionHead
              title={t({ id: 'you.profile.howYouTravel', message: 'How you travel' })}
              action={
                props.onRetake ? (
                  <Pressable
                    onPress={props.onRetake}
                    accessibilityRole="button"
                    hitSlop={theme.space['12']}
                    testID="you-profile-retake"
                  >
                    <Text variant="label" color={theme.semantic.action.primary}>
                      {t({ id: 'you.profile.retake', message: 'Retake' })}
                    </Text>
                  </Pressable>
                ) : undefined
              }
            />
            <Tags tags={model.tags} />
          </Stack>
        ) : null}

        <Stack gap="10">
          <SectionHead title={t({ id: 'you.profile.yourCrews', message: 'Your crews' })} />
          <CrewRows
            crews={model.crews}
            onOpenCrew={props.onOpenCrew}
            onStartCrew={props.onStartCrew}
          />
        </Stack>

        <Row justify="space-between" style={styles.footer}>
          <PrivateContent>
            <Text variant="monoData" color={theme.semantic.text.secondary} testID="you-profile-mrz">
              {model.mrz}
            </Text>
          </PrivateContent>
          <Text variant="monoData" color={theme.semantic.text.secondary}>
            {t({ id: 'you.profile.since', message: `SINCE ${model.sinceYear}` })}
          </Text>
        </Row>
      </ScrollView>
    </Scaffold>
  );
}
