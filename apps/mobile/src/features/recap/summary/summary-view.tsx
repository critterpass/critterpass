/**
 * The recap page (3m-1) from props: the dates and crew over "{PLACE}, THE RECAP" with the guide's
 * shadow beside it, the four stat tiles, the forms card with the one that got away, two award
 * chips, SHARE RECAP / WHERE NEXT?, and under them the rows to rate the trip and play the story
 * again. A back eyebrow heads the page. While the guide is still writing, or when the build failed,
 * the same header sits over that state instead. The lab scenes render it with fixed data; the
 * screen feeds it synced rows.
 */
import type { DistanceUnit } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NextRow } from '@/features/trip';
import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { InfoPill } from '@/ui/chips/InfoPill';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { guideSticker } from '@/ui/avatar/guides';
import type { GuideId } from '@/ui/people/GuideLine';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
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
  /** Back to where the traveller came from (Home or the trip hub). */
  readonly onBack: () => void;
  /** Opens this trip's critter from the forms card. */
  readonly onGotAway?: (() => void) | undefined;
  /** Plays the story again; absent while there is none to play. */
  readonly onWatch?: (() => void) | undefined;
  /** Opens Rate the trip; undefined until that screen exists. */
  readonly onRate?: (() => void) | undefined;
  /** Opens the crew's album; absent when the album has no screen here. */
  readonly onPhotos?: (() => void) | undefined;
  /** Opens the postcard composer. */
  readonly onPostcard?: (() => void) | undefined;
}

export function SummaryView(props: SummaryViewProps) {
  const { model, guide, guideName, unit, offline } = props;
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const insets = useSafeAreaInsets();
  const shadow = guideSticker(guide);
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
        <BackEyebrow
          label={t({ id: 'recap.summary.back', message: 'Back' })}
          onPress={props.onBack}
          testID="recap-back"
        />
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
            {props.onRate === undefined &&
            props.onWatch === undefined &&
            props.onPhotos === undefined &&
            props.onPostcard === undefined ? null : (
              <Stack gap="10">
                {props.onPhotos === undefined ? null : (
                  <NextRow
                    next={{
                      icon: 'camera',
                      label: null,
                      title: t({ id: 'recap.summary.photos', message: 'Photos' }),
                      detail: t({
                        id: 'recap.summary.photosDetail',
                        message: "The crew's album, with the picks",
                      }),
                      tone: 'raised',
                      testID: 'recap-photos',
                      onPress: props.onPhotos,
                    }}
                  />
                )}
                {props.onPostcard === undefined ? null : (
                  <NextRow
                    next={{
                      icon: 'heart',
                      label: null,
                      title: t({ id: 'recap.summary.postcard', message: 'Send a postcard' }),
                      detail: t({
                        id: 'recap.summary.postcardDetail',
                        message: 'One photo and a note, to the crew',
                      }),
                      tone: 'raised',
                      testID: 'recap-postcard',
                      onPress: props.onPostcard,
                    }}
                  />
                )}
                {props.onRate === undefined ? null : (
                  <NextRow
                    next={{
                      icon: 'star',
                      label: null,
                      title: t({ id: 'recap.summary.rate', message: 'Rate the trip' }),
                      detail: t({
                        id: 'recap.summary.rateDetail',
                        message: 'One tap a place, for the next crew',
                      }),
                      tone: 'raised',
                      testID: 'recap-rate',
                      onPress: props.onRate,
                    }}
                  />
                )}
                {props.onWatch === undefined ? null : (
                  <NextRow
                    next={{
                      icon: 'spark',
                      label: null,
                      title: t({ id: 'recap.summary.watch', message: 'Play the story again' }),
                      detail: t({
                        id: 'recap.summary.watchDetail',
                        message: `${guideName} tells it from the start`,
                      }),
                      tone: 'raised',
                      testID: 'recap-watch',
                      onPress: props.onWatch,
                    }}
                  />
                )}
              </Stack>
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
