/**
 * "Couldn't read it" (3i-4): three ways forward instead of an error. What Tokek got ("Total:
 * Rp 1.080.000 at Ibu Oka") and what it missed (by the quality problem: the fold, the blur, the
 * glare, the edge), TYPE THE LINES and RETAKE, FLATTER, and SPLIT EVENLY · $11.37 EACH.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { Grabber } from '@/ui/sheet/Grabber';
import { ErrorSheet } from '@/ui/states/ErrorSheet';
import { makeStyles, useTheme } from '@/ui/theme';
import { useWalletGuide } from '@/features/bookings';

import type { ReaderQualityIssue } from '../data/services';

const useStyles = makeStyles((t) => ({
  panel: {
    backgroundColor: t.semantic.bg.base,
    borderTopStartRadius: t.radius.sheetTop,
    borderTopEndRadius: t.radius.sheetTop,
    paddingHorizontal: t.size.gutter,
    paddingTop: t.space['8'],
    gap: t.space['12'],
  },
}));

export interface FailureSheetProps {
  readonly issue: ReaderQualityIssue | null;
  /** "Rp 1.080.000". */
  readonly total: string;
  readonly merchant: string | null;
  /** "$11.37". */
  readonly each: string;
  readonly onTypeLines: () => void;
  readonly onRetake: () => void;
  readonly onEven: () => void;
  readonly onBack: () => void;
}

export function FailureSheet(props: FailureSheetProps) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const locale = useLocale();
  const { t } = useLingui();
  const { name: guideName } = useWalletGuide();
  const total = props.total;
  const merchant = props.merchant ?? '';
  const each = props.each;
  const missed =
    props.issue === 'crumpled'
      ? t({ id: 'money.failure.missedFold', message: 'Line items: the fold hides them' })
      : props.issue === 'blurry'
        ? t({ id: 'money.failure.missedBlur', message: 'Line items: too blurry to read' })
        : props.issue === 'glare'
          ? t({ id: 'money.failure.missedGlare', message: 'Line items: lost in the glare' })
          : props.issue === 'cut_off'
            ? t({
                id: 'money.failure.missedCut',
                message: 'Line items: part of the paper is cut off',
              })
            : t({
                id: 'money.failure.missed',
                message: `Line items: ${guideName} could not read them`,
              });
  return (
    <View
      style={[styles.panel, { paddingBottom: insets.bottom + theme.space['8'] }]}
      testID="money-failure"
    >
      <Grabber />
      <ErrorSheet
        eyebrow={upper(
          t({ id: 'money.failure.eyebrow', message: `${guideName} got half of it` }),
          locale,
        )}
        title={upper(t({ id: 'money.failure.title', message: 'The total, not the lines' }), locale)}
        facts={[
          {
            key: 'total',
            ok: true,
            text:
              merchant === ''
                ? t({ id: 'money.failure.total', message: `Total: ${total}` })
                : t({ id: 'money.failure.totalAt', message: `Total: ${total} at ${merchant}` }),
          },
          { key: 'lines', ok: false, text: missed },
        ]}
        alternatives={[
          {
            key: 'type',
            title: upper(t({ id: 'money.failure.type', message: 'Type the lines' }), locale),
            body: t({
              id: 'money.failure.typeBody',
              message: `${guideName} fills in the prices it could read`,
            }),
            onPress: props.onTypeLines,
          },
          {
            key: 'retake',
            title: upper(t({ id: 'money.failure.retake', message: 'Retake, flatter' }), locale),
            body: t({
              id: 'money.failure.retakeBody',
              message: `Hold it on the table. ${guideName} will wait`,
            }),
            onPress: props.onRetake,
          },
        ]}
        primary={{
          label: upper(
            t({ id: 'money.failure.even', message: `Split evenly · ${each} each` }),
            locale,
          ),
          onPress: props.onEven,
        }}
        onBack={props.onBack}
        backLabel={t({ id: 'money.failure.back', message: 'Back to Money' })}
        testID="money-failure-body"
      />
    </View>
  );
}
