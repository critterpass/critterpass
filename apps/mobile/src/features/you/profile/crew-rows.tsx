/**
 * YOUR CREWS on the profile (3n-1): one raised card, a row per crew divided by a hairline, each
 * with its faces, its name in the display face set in capitals ("THE BALI SIX") and one line on
 * where it is headed. No crew yet: one "Start a crew" row.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { Fragment, type ReactNode } from 'react';
import { I18nManager, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { SecondaryText } from '@/ui/cards/SecondaryText';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { AvatarStack } from '@/ui/people/AvatarStack';
import { PressScale } from '@/ui/press/PressScale';
import { Text } from '@/ui/text/Text';
import { makeStyles } from '@/ui/theme';

import { crewLineText } from './profile-copy';
import { CREW_FACES, type ProfileCrew } from './profile-model';

const useStyles = makeStyles((t) => ({
  group: { backgroundColor: t.semantic.bg.raised, borderRadius: t.radius.lg, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['12'],
    paddingHorizontal: t.size.cardInner.max,
    paddingVertical: t.space['14'],
  },
  body: { flex: 1, minWidth: 0 },
  divider: { height: 1, marginHorizontal: t.size.cardInner.max, backgroundColor: t.color.divider },
}));

function CrewRow(props: {
  readonly title: string;
  readonly line: string;
  readonly leading?: ReactNode;
  readonly onPress?: (() => void) | undefined;
  readonly testID: string;
}) {
  const styles = useStyles();
  const content = (
    <>
      {props.leading}
      <Stack gap="2" style={styles.body}>
        <Text variant="h3" numberOfLines={2}>
          {props.title}
        </Text>
        <SecondaryText>{props.line}</SecondaryText>
      </Stack>
      {props.onPress ? (
        <SecondaryText variant="title" accessibilityElementsHidden>
          {I18nManager.isRTL ? '‹' : '›'}
        </SecondaryText>
      ) : null}
    </>
  );
  if (!props.onPress) {
    return (
      <Row
        style={styles.row}
        accessible
        accessibilityLabel={`${props.title}, ${props.line}`}
        testID={props.testID}
      >
        {content}
      </Row>
    );
  }
  return (
    <PressScale
      onPress={props.onPress}
      widthClass="wide"
      accessibilityRole="button"
      accessibilityLabel={`${props.title}, ${props.line}`}
      style={styles.row}
      testID={props.testID}
    >
      {content}
    </PressScale>
  );
}

export function CrewRows(props: {
  readonly crews: readonly ProfileCrew[];
  readonly onOpenCrew?: ((crewId: string) => void) | undefined;
  readonly onStartCrew?: (() => void) | undefined;
}) {
  const { t } = useLingui();
  const styles = useStyles();
  const locale = useLocale();
  return (
    <View style={styles.group}>
      {props.crews.map((crew, index) => (
        <Fragment key={crew.id}>
          {index > 0 ? <View style={styles.divider} /> : null}
          <CrewRow
            title={upper(crew.name, locale)}
            line={crewLineText(crew.line, locale)}
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
            onPress={props.onOpenCrew ? () => props.onOpenCrew?.(crew.id) : undefined}
            testID={`you-profile-crew-${crew.id}`}
          />
        </Fragment>
      ))}
      {props.crews.length === 0 ? (
        <CrewRow
          title={upper(t({ id: 'you.profile.startCrew', message: 'Start a crew' }), locale)}
          line={t({
            id: 'you.profile.startCrewLine',
            message: 'Trips are better with your people.',
          })}
          onPress={props.onStartCrew}
          testID="you-profile-start-crew"
        />
      ) : null}
    </View>
  );
}
