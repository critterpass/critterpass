/**
 * The free first trip ending (9.21) on the legacy kit: the days left, what is kept for good, what
 * pauses, and the three ways on. A window that has closed (opened late from the push) says so and
 * keeps only the way back.
 */
import { ScrollView, View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { Tag } from '@/ui/chips/Tag';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { usePlanDate } from '../plan/plan-copy';
import { useFtfEndingCopy } from './ftf-ending-copy';
import { FTF_KEPT, FTF_PAUSED, type FtfEndingModel } from './ftf-ending-model';
import type { FtfEndingActions } from './ftf-ending-screen';

export interface FtfEndingViewProps extends FtfEndingActions {
  readonly ending: FtfEndingModel | null;
}

const useStyles = makeStyles((t) => ({
  content: {
    flexGrow: 1,
    padding: t.size.gutter,
    paddingBottom: t.space['32'],
    gap: t.space['20'],
  },
  wrap: { flexWrap: 'wrap' },
  spacer: { flex: 1 },
}));

export function FtfEndingView({ ending, ...actions }: FtfEndingViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const copy = useFtfEndingCopy();
  const planDate = usePlanDate();
  const date = ending === null ? '' : (planDate(ending.endsAt.toISOString()) ?? '');

  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="ftf-ending">
      <ScrollView contentContainerStyle={styles.content}>
        <BackEyebrow label={copy.title} onPress={actions.onBack} testID="ftf-ending-back" />
        {ending === null ? (
          <Stack gap="10" testID="ftf-ending-ended">
            <Text variant="h1" accessibilityRole="header">
              {copy.ended}
            </Text>
            <Text variant="bodyLg" color={theme.semantic.text.secondary}>
              {copy.endedLine}
            </Text>
          </Stack>
        ) : (
          <>
            <Row gap="16" align="center">
              <Text variant="displayXl" testID="ftf-ending-days">
                {String(ending.daysLeft)}
              </Text>
              <Stack gap="4" style={styles.spacer}>
                <Text variant="h2" accessibilityRole="header">
                  {copy.daysLeft}
                </Text>
                <Text variant="bodySm" color={theme.semantic.text.secondary}>
                  {copy.pauses(date)}
                </Text>
              </Stack>
            </Row>
            <Text variant="bodyLg" color={theme.semantic.text.secondary}>
              {copy.guideNote}
            </Text>
            <Stack gap="8">
              <Text variant="label" color={theme.semantic.state.success}>
                {copy.keptLabel}
              </Text>
              <Row gap="8" style={styles.wrap}>
                {FTF_KEPT.map((key) => (
                  <Tag key={key} label={copy.kept[key]} tone="success" />
                ))}
              </Row>
            </Stack>
            <Stack gap="8">
              <Text variant="label" color={theme.semantic.text.secondary}>
                {copy.pausedLabel(date)}
              </Text>
              <Row gap="8" style={styles.wrap}>
                {FTF_PAUSED.map((key) => (
                  <Tag key={key} label={copy.paused[key]} tone="neutral" />
                ))}
              </Row>
            </Stack>
          </>
        )}
        <View style={styles.spacer} />
        {ending === null ? null : (
          <Stack gap="12">
            <PillButton
              label={copy.boost(ending.place)}
              onPress={actions.onBoost}
              block
              testID="ftf-ending-boost"
            />
            <PillButton
              label={copy.passPlus}
              variant="secondary"
              onPress={actions.onPassPlus}
              block
              testID="ftf-ending-pass-plus"
            />
            <TextLink
              label={copy.stayFree}
              onPress={actions.onStayFree}
              testID="ftf-ending-stay-free"
            />
          </Stack>
        )}
      </ScrollView>
    </Scaffold>
  );
}
