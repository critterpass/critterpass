/**
 * The running-late screen (3k-9) from props: the map behind (the place and your own dot; no map
 * offline, the sheet alone), the back and ETA pills, and the sheet. A late member gets the
 * planner's options as radio rows with one button that names the pick; whoever waits for them is
 * told who is late and when the item starts for them. A resolved disruption says so.
 */
import type { LateOption, LateOptionKind } from '@cp/domain';
import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { GUIDE_STICKERS, type GuideStickerId } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { InfoPill } from '@/ui/chips/InfoPill';
import { RadioCard } from '@/ui/inputs/RadioCard';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { useBackAffordance } from '@/ui/qa/back-affordance';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { EmptyState } from '@/ui/states/EmptyState';
import { Skeleton } from '@/ui/states/Skeleton';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import {
  backLabel,
  ctaLabel,
  etaPill,
  eyebrow,
  lateChip,
  lateLines,
  lateTitle,
  optionDetail,
  optionTitle,
  vendorChip,
  waitingLine,
  waitingTitle,
} from './copy';
import { initialSelection, type LateModel } from './model';

export interface LateViewProps {
  readonly state: 'loading' | 'missing' | 'ready';
  readonly model: LateModel | null;
  /** The guide's line about why (in the reader's language). */
  readonly reason: string;
  /** Names of the late party, for whoever waits. */
  readonly lateNames: readonly string[];
  /** The map, or null when there is none to show (offline with no tiles). */
  readonly map: ReactNode | null;
  readonly guide: GuideStickerId;
  readonly guideName: string;
  readonly sending: boolean;
  readonly onBack: () => void;
  readonly onChoose: (option: LateOptionKind) => void;
}

const EMPTY_STICKER = 120;

const useStyles = makeStyles((th) => ({
  fill: { flex: 1 },
  mapLayer: { position: 'absolute', top: 0, bottom: 0, start: 0, end: 0 },
  header: { paddingHorizontal: th.size.gutter },
  sheet: {
    backgroundColor: th.semantic.bg.sunken,
    borderTopStartRadius: th.radius.sheetTop,
    borderTopEndRadius: th.radius.sheetTop,
    paddingHorizontal: th.size.gutter,
    paddingTop: th.space['20'],
  },
  options: { gap: th.space['8'] },
}));

function Options(props: {
  readonly model: LateModel;
  readonly selected: LateOptionKind | null;
  readonly onSelect: (option: LateOptionKind) => void;
}) {
  const styles = useStyles();
  const locale = useLocale();
  const { vendor } = props.model;
  return (
    <View style={styles.options}>
      {props.model.options.map((option: LateOption) => (
        <RadioCard
          key={option.id}
          title={optionTitle(option)}
          description={optionDetail(option, locale)}
          selected={props.selected === option.id}
          onSelect={() => props.onSelect(option.id)}
          trailing={
            option.vendor_name !== null && vendor !== null && option.id === 'push' ? (
              <InfoPill>{vendorChip(vendor.name, vendor.status, locale)}</InfoPill>
            ) : undefined
          }
          testID={`late-option-${option.id}`}
        />
      ))}
    </View>
  );
}

/** The map screen's back pill is its way back (the pill, not the eyebrow, sits on a map). */
function BackPill({ onBack }: { readonly onBack: () => void }) {
  useBackAffordance();
  return (
    <PillButton
      label={`← ${backLabel()}`}
      variant="secondary"
      size="sm"
      onPress={onBack}
      testID="late-back"
    />
  );
}

export function LateView(props: LateViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const locale = useLocale();
  const { model } = props;
  const [picked, setPicked] = useState<LateOptionKind | null>(null);
  const lines = lateLines();
  if (props.state !== 'ready' || model === null) {
    return (
      <Scaffold testID="late-screen">
        <Stack gap="16" style={{ padding: theme.size.gutter }}>
          <BackEyebrow label={backLabel()} onPress={props.onBack} testID="late-back" />
          {props.state === 'loading' ? (
            <Skeleton preset="card" testID="late-loading" />
          ) : (
            <EmptyState
              guide={props.guide}
              guideName={props.guideName}
              sticker={
                <Sticker
                  kind={GUIDE_STICKERS[props.guide].kind}
                  name={GUIDE_STICKERS[props.guide].name}
                  pose="sleep"
                  size={EMPTY_STICKER}
                />
              }
              title={lines.missingTitle}
              line={lines.missing}
              action={{ label: lines.backAction, onPress: props.onBack }}
              testID="late-missing"
            />
          )}
        </Stack>
      </Scaffold>
    );
  }
  const selected = picked ?? initialSelection(model);
  const option = model.options.find((o) => o.id === selected) ?? null;
  const settled = selected !== null && selected === model.chosen;
  return (
    <Scaffold variant="map" edges={[]} testID="late-screen">
      <View style={styles.mapLayer}>{props.map}</View>
      <Row
        justify="space-between"
        style={[styles.header, { paddingTop: insets.top + theme.space['8'] }]}
      >
        <BackPill onBack={props.onBack} />
        {model.open ? (
          <InfoPill testID="late-eta">{etaPill(model.eta, model.stale, locale)}</InfoPill>
        ) : null}
      </Row>
      <View style={styles.fill} pointerEvents="none" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + theme.space['16'] }]}>
        <ScrollView bounces={false}>
          <Stack gap="12">
            <Row justify="space-between" align="center">
              <Text variant="eyebrow" color={theme.semantic.text.secondary}>
                {eyebrow(model.title, model.start, locale)}
              </Text>
              {model.open ? <InfoPill>{lateChip(model.lateMin, locale)}</InfoPill> : null}
            </Row>
            {props.map === null ? (
              <Text variant="caption" color={theme.semantic.text.tertiary} testID="late-no-map">
                {lines.offlineMap}
              </Text>
            ) : null}
            {!model.open ? (
              <Text variant="h2" singleLine={false} testID="late-on-time">
                {lines.onTime}
              </Text>
            ) : model.role === 'late' ? (
              <>
                <Text variant="displayXl" singleLine={false} testID="late-title">
                  {lateTitle(model.lateMin, locale)}
                </Text>
                <Text variant="body" color={theme.semantic.text.secondary} singleLine={false}>
                  {props.reason}
                </Text>
                <Options model={model} selected={selected} onSelect={setPicked} />
                <PillButton
                  label={settled ? lines.chosen : ctaLabel(option)}
                  block
                  flap
                  disabled={option === null || settled}
                  loading={props.sending}
                  onPress={() => {
                    if (option !== null && !settled) props.onChoose(option.id);
                  }}
                  testID="late-choose"
                />
              </>
            ) : (
              <>
                <Text variant="h2" singleLine={false} testID="late-waiting-title">
                  {waitingTitle(props.lateNames, model.lateMin, locale)}
                </Text>
                <Text variant="body" color={theme.semantic.text.secondary} singleLine={false}>
                  {waitingLine(model.title, model.start)}
                </Text>
              </>
            )}
          </Stack>
        </ScrollView>
      </View>
    </Scaffold>
  );
}
