/**
 * "What's in each" (4e-2): Free, Pass+ and Boost side by side. The rows are the perks the server
 * has switched on; tapping a column moves the highlighter and lights its button. Each row reads
 * across all three plans for a screen reader.
 */
import type { StorePlatform } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { ComparisonTable } from '@/ui/monetize/ComparisonTable';
import { Sticker } from '@/ui/sticker/Sticker';
import { SurfaceToneProvider } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { PaywallModel } from '../paywall/paywall-model';
import { Disclosure, usePhaseLine } from '../paywall/purchase-copy';
import type { CompareCell, CompareRowSpec } from '../perks/perk-copy';

export type CompareColumn = 'free' | 'pass' | 'boost';

export interface CompareViewProps {
  readonly rows: readonly CompareRowSpec[];
  readonly model: PaywallModel;
  readonly store: StorePlatform | null;
  /** Whether there is a trip a boost could go on from here. */
  readonly canBoost: boolean;
  readonly onBuy: () => void;
  readonly onCheckAgain: () => void;
  readonly onBoost: () => void;
  readonly onTerms: () => void;
  readonly onPrivacy: () => void;
}

const useStyles = makeStyles((t) => ({
  content: {
    padding: t.size.gutter,
    paddingTop: t.space['32'] + t.space['24'],
    paddingBottom: t.space['32'],
    gap: t.space['16'],
  },
  page: {
    backgroundColor: t.color.paper.base,
    borderRadius: t.radius.xl,
    padding: t.space['16'],
    gap: t.space['12'],
  },
  half: { flex: 1 },
  centre: { textAlign: 'center' },
}));

export function CompareView(props: CompareViewProps) {
  const { t, i18n } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const phaseLine = usePhaseLine();
  const [column, setColumn] = useState<CompareColumn>('pass');
  const { model } = props;
  const { phase, offer, boost } = model;
  const busy = phase === 'purchasing' || phase === 'verifying';
  const status = phaseLine(phase);

  const cell = (value: CompareCell): string =>
    value.kind === 'text'
      ? i18n._(value.copy)
      : value.kind === 'yes'
        ? t({ id: 'monetize.compare.yes', message: '✓' })
        : t({ id: 'monetize.compare.no', message: '–' });
  const passLabel = t({ id: 'monetize.compare.pass', message: 'Pass+' });
  const boostLabel = t({ id: 'monetize.compare.boost', message: 'Boost' });

  return (
    <ScrollView contentContainerStyle={styles.content} testID="compare">
      <View style={styles.page}>
        <SurfaceToneProvider value="paper">
          <Row justify="space-between" importantForAccessibility="no-hide-descendants">
            <Text variant="monoData">
              {t({ id: 'monetize.compare.chrome', message: 'ENTRIES · ENTRÉES' })}
            </Text>
            <Text variant="monoData">{t({ id: 'monetize.compare.page', message: 'PAGE 08' })}</Text>
          </Row>
          <Text variant="h1" accessibilityRole="header">
            {t({ id: 'monetize.compare.title', message: 'What’s in each' })}
          </Text>
          {props.rows.length === 0 ? (
            <Text variant="body" testID="compare-empty">
              {t({
                id: 'monetize.compare.empty',
                message:
                  'The plan details aren’t on this phone yet. Open this again when you’re online.',
              })}
            </Text>
          ) : (
            <ComparisonTable
              highlighted={column}
              onHighlight={(id) => setColumn(id as CompareColumn)}
              columns={[
                { id: 'free', label: t({ id: 'monetize.compare.free', message: 'Free' }) },
                { id: 'pass', label: passLabel },
                { id: 'boost', label: boostLabel },
              ]}
              rows={[
                ...props.rows.map((row) => ({
                  label: i18n._(row.label),
                  values: row.cells.map(cell),
                })),
                {
                  label: t({ id: 'monetize.compare.covers', message: 'Covers' }),
                  values: [
                    t({ id: 'monetize.compare.covers.free', message: 'You' }),
                    t({ id: 'monetize.compare.covers.pass', message: 'You, every crew' }),
                    t({ id: 'monetize.compare.covers.boost', message: 'One trip, whole crew' }),
                  ],
                },
              ]}
              testID="compare-table"
            />
          )}
          <Row gap="12" align="center">
            <Sticker kind="gecko" name="Tokek" size={48} />
            <Text variant="voice" color={theme.color.rust.darkened} style={styles.half}>
              {t({
                id: 'monetize.compare.note',
                message:
                  'Voting, splitting money, offline maps and every critter stay free for everyone.',
              })}
            </Text>
          </Row>
        </SurfaceToneProvider>
      </View>
      <Row gap="12">
        <View style={styles.half}>
          {phase === 'subscribed' ? (
            <PillButton
              label={t({ id: 'monetize.compare.havePass', message: 'You have Pass+' })}
              onPress={props.onBuy}
              disabled
              block
              testID="compare-pass-current"
            />
          ) : phase === 'verify_failed' ? (
            <PillButton
              label={t({ id: 'monetize.paywall.checkAgain', message: 'Check again' })}
              onPress={props.onCheckAgain}
              block
              testID="compare-check-again"
            />
          ) : (
            <PillButton
              label={offer === null ? passLabel : `${passLabel} · ${offer.priceString}`}
              onPress={props.onBuy}
              variant={column === 'boost' ? 'secondary' : 'primary'}
              loading={busy || phase === 'loading'}
              disabled={!model.canBuy}
              block
              testID="compare-buy-pass"
            />
          )}
        </View>
        {props.canBoost && boost ? (
          <View style={styles.half}>
            <PillButton
              label={`${boostLabel} · ${boost.priceString}`}
              onPress={props.onBoost}
              tone="pink"
              variant={column === 'boost' ? 'primary' : 'secondary'}
              disabled={busy}
              block
              testID="compare-boost"
            />
          </View>
        ) : null}
      </Row>
      {status === null ? null : (
        <Text
          variant="bodySm"
          color={theme.semantic.text.secondary}
          style={styles.centre}
          accessibilityLiveRegion="polite"
          testID={`compare-phase-${phase}`}
        >
          {status}
        </Text>
      )}
      {phase === 'subscribed' ? null : (
        <Stack gap="4">
          <Disclosure
            kind="subscription"
            price={offer?.priceString}
            period={model.period}
            store={props.store}
            onTerms={props.onTerms}
            onPrivacy={props.onPrivacy}
            testID="compare-disclosure"
          />
          {props.canBoost && boost ? (
            <Text
              variant="caption"
              color={theme.semantic.text.secondary}
              style={styles.centre}
              testID="compare-boost-terms"
            >
              {t({
                id: 'monetize.disclosure.once',
                message: 'A boost is one trip, paid once. It doesn’t renew.',
              })}
            </Text>
          ) : null}
        </Stack>
      )}
    </ScrollView>
  );
}
