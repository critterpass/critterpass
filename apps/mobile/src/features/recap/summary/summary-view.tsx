/**
 * The recap page (3m-1) from props: the dates and crew over "{PLACE}, THE RECAP" with the guide's
 * shadow beside it, the four stat tiles, the forms card with the one that got away, two award
 * chips, and SHARE RECAP / WHERE NEXT?. While the guide is still writing, or when the build failed,
 * the same header sits over that state instead. The lab scenes render it with fixed data; the
 * screen feeds it synced rows.
 */
import type { DistanceUnit } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { InfoPill } from '@/ui/chips/InfoPill';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import type { GuideId } from '@/ui/people/GuideLine';
import { useNoBackByDesign } from '@/ui/qa/back-affordance';
import { OfflinePill } from '@/ui/states/OfflinePill';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { AwardChips } from './award-chips';
import { awardDetail, awardTitle } from './award-copy';
import { FormsCard } from './forms-card';
import { StatTiles } from './stat-tiles';
import {
  formsCount,
  formsEyebrow,
  gotAwayLine,
  headerEyebrow,
  headerTitle,
  tileCopy,
  updatedBadge,
} from './summary-copy';
import type { SummaryModel } from './summary-model';
import { SummaryState } from './summary-states';

const SHADOW_SIZE = 96;

const useStyles = makeStyles((th) => ({
  content: { paddingHorizontal: th.size.gutter, gap: th.space['16'] },
  header: { gap: th.space['6'] },
  // The guide's shadow sits behind the title's end, as the design draws it.
  shadow: { position: 'absolute', top: th.space['4'], end: 0 },
  ctas: { flexDirection: 'row', gap: th.space['10'] },
  cta: { flex: 1 },
  watch: { alignItems: 'center' },
}));

export interface SummaryViewProps {
  readonly model: SummaryModel;
  readonly guide: GuideId;
  readonly guideName: string;
  readonly unit: DistanceUnit;
  readonly offline: boolean;
  readonly retrying: boolean;
  readonly onRetry: () => void;
  readonly onShare: () => void;
  readonly onWhereNext: () => void;
  /** Opens the legendary calendar from the forms card, once that screen exists. */
  readonly onGotAway?: (() => void) | undefined;
  /** Plays the story again; absent while there is none to play. */
  readonly onWatch?: (() => void) | undefined;
}

export function SummaryView(props: SummaryViewProps) {
  const { model, guide, guideName, unit, offline } = props;
  useNoBackByDesign();
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const insets = useSafeAreaInsets();
  const shadow = GUIDE_STICKERS[guide];
  const forms = model.forms;
  const gotAway = model.gotAway;

  return (
    <Scaffold testID="recap-summary">
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: theme.space['12'],
            paddingBottom: insets.bottom + theme.space['24'],
          },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.shadow}>
            <Sticker
              kind={shadow.kind}
              name={guideName}
              size={SHADOW_SIZE}
              variant="mask"
              maskColor={theme.semantic.bg.raised}
              pose="idle"
            />
          </View>
          <Text variant="eyebrow" testID="recap-eyebrow">
            {headerEyebrow(model, locale)}
          </Text>
          <Text variant="h1" accessibilityRole="header" testID="recap-title">
            {headerTitle(model)}
          </Text>
        </View>
        {offline || model.updated !== null || model.dropout ? (
          <Row gap="8" wrap>
            {offline ? (
              <OfflinePill label={t({ id: 'recap.summary.offline', message: 'No signal' })} />
            ) : null}
            {model.updated === null ? null : (
              <InfoPill icon="spark" testID="recap-updated">
                {updatedBadge(model.updated)}
              </InfoPill>
            )}
            {model.dropout ? (
              <InfoPill variant="outline" testID="recap-dropout">
                {t({ id: 'recap.summary.dropout', message: 'You sat this one out' })}
              </InfoPill>
            ) : null}
          </Row>
        ) : null}
        {model.phase === 'ready' ? (
          <Stack gap="16">
            <StatTiles
              tiles={model.tiles.map((tile) => ({
                id: tile.id,
                copy: tileCopy(tile, locale, unit),
              }))}
            />
            {forms === null ? null : (
              <FormsCard
                card={forms}
                eyebrow={formsEyebrow(forms.kind, gotAway?.name ?? null)}
                count={formsCount(forms.found, forms.total, forms.kind)}
                line={gotAway === null ? null : gotAwayLine(gotAway)}
                onPress={props.onGotAway}
              />
            )}
            {forms === null && gotAway !== null ? (
              <Text variant="body" testID="recap-got-away-line">
                {gotAwayLine(gotAway)}
              </Text>
            ) : null}
            <AwardChips
              chips={model.awards.map((chip) => ({
                id: chip.id,
                title: chip.title ?? awardTitle(chip.kind),
                detail: awardDetail(chip),
                mvp: chip.mvp,
              }))}
            />
            <View style={styles.ctas}>
              <View style={styles.cta}>
                <PillButton
                  label={t({ id: 'recap.summary.share', message: 'Share recap' })}
                  tone="cream"
                  block
                  onPress={props.onShare}
                  testID="recap-share"
                />
              </View>
              <View style={styles.cta}>
                <PillButton
                  label={t({ id: 'recap.summary.whereNext', message: 'Where next? →' })}
                  tone="yellow"
                  block
                  onPress={props.onWhereNext}
                  testID="recap-where-next"
                />
              </View>
            </View>
            {props.onWatch === undefined ? null : (
              <View style={styles.watch}>
                <TextLink
                  label={t({ id: 'recap.summary.watch', message: 'Play the story again' })}
                  onPress={props.onWatch}
                  testID="recap-watch"
                />
              </View>
            )}
          </Stack>
        ) : (
          <SummaryState
            phase={model.phase}
            guide={guide}
            guideName={guideName}
            retrying={props.retrying}
            onRetry={props.onRetry}
          />
        )}
      </ScrollView>
    </Scaffold>
  );
}
