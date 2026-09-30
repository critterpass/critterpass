/* eslint-disable lingui/no-unlocalized-strings -- sample words and key colours, only in the (dev) type lab. */
import { setupI18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { resolveTypeVariant } from '@cp/design-tokens';

import { fontFor } from '@/lib/fonts';

import { InlineAction } from '../../buttons/InlineAction';
import { PillButton } from '../../buttons/PillButton';
import { ChoiceChip } from '../../chips/ChoiceChip';
import { CountBadge } from '../../chips/CountBadge';
import { FilterChip } from '../../chips/FilterChip';
import { InfoPill } from '../../chips/InfoPill';
import { QuickActionChip } from '../../chips/QuickActionChip';
import { StatusChip } from '../../chips/StatusChip';
import { TierLabel } from '../../chips/TierLabel';
import { Segmented } from '../../inputs/Segmented';
import { ActionPill } from '../../plan/ActionPill';
import { HeaderPill } from '../../shell/HeaderPills';
import { useTheme } from '../../theme';
import { FACE_METRICS } from '../glyph-room';
import { Text, TEXT_VARIANTS } from '../Text';
import type { TypeLabLocale, TypeLabPage, TypeLabRow } from './type-lab-rows';
import { TYPE_LAB_WORDS, typeLabRows } from './type-lab-rows';

/**
 * Key colours the capture analysis (tools/scripts/fonts/label-centring.ts) finds: the calibration
 * bar is 200 pt wide, a row's left bar spans its component's height and its right bar the ideal
 * cap box, centred on the component.
 */
// eslint-disable-next-line critterpass/no-literal-style -- key colours for pixel analysis, not UI.
const KEY = { calibration: '#00FF00', component: '#FF00FF', capBox: '#00FFFF' } as const;
const CALIBRATION_PT = 200;
const BAR_PT = 4;
const GAP_PT = 6;

const noop = () => undefined;

/** The height of the flat capitals (Thai: consonant body) the row's label is set with, in pt. */
function capBoxPt(variant: TypeLabRow['variant'], locale: TypeLabLocale): number {
  const token = TEXT_VARIANTS[variant];
  const resolved = resolveTypeVariant(token, { fontScale: 1 });
  const widthStep = token.widthStep ?? token.widthStepMin;
  const font = fontFor(
    {
      fontFamily: token.fontFamily,
      fontWeight: token.fontWeight,
      ...(widthStep !== undefined ? { widthStep } : {}),
      lineHeightMultiplier: resolved.lineHeightMultiplier,
      condensed: token.condensed,
    },
    locale,
  );
  const metrics = FACE_METRICS[font.fontFamily.split('-', 1)[0] ?? ''];
  return (metrics?.capHeight ?? 0.7) * resolved.fontSize * font.sizeMultiplier;
}

function Component({ row, word }: { readonly row: TypeLabRow; readonly word: string }) {
  const theme = useTheme();
  switch (row.component) {
    case 'pill-lg-primary':
      return <PillButton label={word} onPress={noop} block={false} />;
    case 'pill-lg-secondary':
      return <PillButton label={word} variant="secondary" onPress={noop} block={false} />;
    case 'pill-lg-sentence':
      return <PillButton label={word} casing="sentence" tone="ink" onPress={noop} block={false} />;
    case 'pill-sm-primary':
      return <PillButton label={word} size="sm" onPress={noop} />;
    case 'pill-sm-secondary':
      return <PillButton label={word} size="sm" variant="secondary" onPress={noop} />;
    case 'inline-choice':
      return <InlineAction label={word} onPress={noop} />;
    case 'inline-selected':
      return <InlineAction label={word} selected onPress={noop} />;
    case 'inline-ghost':
      return <InlineAction label={word} kind="ghost" onPress={noop} />;
    case 'action-primary':
      return <ActionPill label={word} tone="primary" onPress={noop} />;
    case 'action-outline':
      return <ActionPill label={word} tone="outline" onPress={noop} />;
    case 'action-secondary':
      return <ActionPill label={word} onPress={noop} />;
    case 'header-action':
      return <HeaderPill label={word} onPress={noop} />;
    case 'header-private':
      return <HeaderPill label={word} tone="private" />;
    case 'header-countdown':
      return <HeaderPill label={word} tone="countdown" />;
    case 'segmented':
      return (
        <Segmented
          label={word}
          segments={[{ value: 'one', label: word }]}
          value="one"
          onChange={noop}
        />
      );
    case 'quick-action':
      return <QuickActionChip label={word} onPress={noop} />;
    case 'choice':
      return <ChoiceChip label={word} selected={false} tilt={0} onPress={noop} />;
    case 'choice-selected':
      return <ChoiceChip label={word} selected tilt={0} onPress={noop} />;
    case 'filter':
      return <FilterChip label={word} selected={false} onPress={noop} />;
    case 'filter-selected':
      return <FilterChip label={word} selected onPress={noop} />;
    case 'status':
      return <StatusChip status="booked" label={word} />;
    case 'info-solid':
      return <InfoPill>{word}</InfoPill>;
    case 'info-outline':
      return <InfoPill variant="outline">{word}</InfoPill>;
    case 'count-badge':
      return <CountBadge count={42} />;
    case 'tier':
      return <TierLabel tier="rare" />;
    case 'face':
      return (
        <View style={[styles.faceBox, { backgroundColor: theme.semantic.bg.control }]}>
          <Text variant={row.variant}>{word}</Text>
        </View>
      );
  }
}

/** One component between its two key bars, with the guide lines over it when asked. */
function LabRow({
  capPt,
  guides,
  children,
}: {
  readonly capPt: number;
  readonly guides: boolean;
  readonly children: ReactNode;
}) {
  return (
    <View style={styles.row}>
      <View style={[styles.bar, { backgroundColor: KEY.component }]} />
      <View style={styles.component}>
        {children}
        {guides ? (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.centre]}>
            <View style={[styles.capBox, { height: capPt }]}>
              <View style={styles.centreLine} />
            </View>
          </View>
        ) : null}
      </View>
      <View style={[styles.bar, styles.centre]}>
        <View style={{ height: capPt, backgroundColor: KEY.capBox }} />
      </View>
    </View>
  );
}

/**
 * One page of the type lab: every row of its group in its locale, each component flanked by key
 * bars for the capture analysis; with `guides`, a centre line and the ideal cap box drawn over it.
 */
export function TypeLabScene({
  page,
  onBack,
}: {
  readonly page: TypeLabPage;
  /** Tapping the page's title goes back to the list (captures tap it on both platforms). */
  readonly onBack: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const i18n = useMemo(
    () => setupI18n({ locale: page.locale, messages: { [page.locale]: {} } }),
    [page.locale],
  );
  const words = TYPE_LAB_WORDS[page.locale];
  return (
    <I18nProvider i18n={i18n}>
      <View
        testID="type-scene-ready"
        style={[
          styles.page,
          { backgroundColor: theme.semantic.bg.base, paddingTop: insets.top + 8 },
        ]}
      >
        <Pressable testID="type-scene-back" accessibilityRole="button" onPress={onBack}>
          <Text variant="caption">{`‹ ${page.id}`}</Text>
        </Pressable>
        <View style={[styles.calibration, { backgroundColor: KEY.calibration }]} />
        {typeLabRows(page.group, page.locale).map((row) => (
          <LabRow key={row.name} capPt={capBoxPt(row.variant, page.locale)} guides={page.guides}>
            <Component row={row} word={words[row.word]} />
          </LabRow>
        ))}
      </View>
    </I18nProvider>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 16, gap: 6 },
  calibration: { width: CALIBRATION_PT, height: 4, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'stretch', gap: GAP_PT },
  bar: { width: BAR_PT },
  component: { alignSelf: 'flex-start', flexShrink: 1 },
  centre: { justifyContent: 'center' },
  capBox: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: KEY.capBox,
    justifyContent: 'center',
  },
  centreLine: { height: StyleSheet.hairlineWidth, backgroundColor: KEY.component },
  faceBox: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
});
