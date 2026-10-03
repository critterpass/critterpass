import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';

import { SecondaryText } from '../cards/SecondaryText';
import { Row } from '../layout/Row';
import { PressScale } from '../press/PressScale';
import { Stack } from '../layout/Stack';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';
import type { Tier } from './tier';
import { TierWord, tierWord } from './tier';

export interface HereNowForm {
  readonly tier: Tier;
  /** Sticker when found; silhouette slot when not. */
  readonly sticker: ReactNode;
  readonly found: boolean;
}

export interface HereNowFormsProps {
  /** "Here now · Bali". */
  readonly title: string;
  /** "Tokek · 2 of 4 forms". */
  readonly subtitle?: string;
  readonly forms: readonly HereNowForm[];
  /** "Epic is tomorrow: summit Batur by sunrise." */
  readonly hint?: string;
  /** Makes each form a button (the form's index in `forms`); without it the forms are images. */
  readonly onPressForm?: (index: number) => void;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  card: {
    borderRadius: th.radius.lg,
    borderWidth: th.space['2'],
    borderColor: th.semantic.action.primary,
    backgroundColor: th.semantic.bg.raised,
    padding: th.space['14'],
    gap: th.space['12'],
  },
  cell: { flex: 1, alignItems: 'center', gap: th.space['6'] },
  cellInner: { alignItems: 'center', gap: th.space['6'] },
  header: { columnGap: th.space['12'], rowGap: th.space['4'] },
  title: { flexShrink: 1 },
}));

export function formLabel(tier: Tier, found: boolean): string {
  const word = tierWord(tier);
  return found
    ? t({ id: 'common.critter.formFound', message: `${word} form, found` })
    : t({ id: 'common.critter.formMissing', message: `${word} form, not found yet` });
}

/** The local critter's four forms for where you are now, found ones in colour, with a hint. */
export function HereNowForms({
  title,
  subtitle,
  forms,
  hint,
  onPressForm,
  testID,
}: HereNowFormsProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Stack style={styles.card} testID={testID}>
      {/* The place and the count share a line when both fit; a long place name sends the count
          to its own line, and the place itself may wrap, so the two never overlap. */}
      <Row
        justify="space-between"
        align="baseline"
        wrap
        style={styles.header}
        accessible
        accessibilityRole="header"
      >
        <Text variant="title" color={theme.semantic.action.primary} style={styles.title}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="label" singleLine={false}>
            {subtitle}
          </Text>
        ) : null}
      </Row>
      <Row gap="8">
        {forms.map((form, index) => {
          const cell = (
            <>
              {form.sticker}
              <TierWord tier={form.tier} glyph={false} fit />
            </>
          );
          return onPressForm === undefined ? (
            <Stack
              key={form.tier}
              style={styles.cell}
              accessible
              accessibilityRole="image"
              accessibilityLabel={formLabel(form.tier, form.found)}
            >
              {cell}
            </Stack>
          ) : (
            <PressScale
              key={form.tier}
              style={styles.cell}
              onPress={() => onPressForm(index)}
              accessibilityRole="button"
              accessibilityLabel={formLabel(form.tier, form.found)}
              {...(testID === undefined ? {} : { testID: `${testID}-form-${form.tier}` })}
            >
              <Stack style={styles.cellInner}>{cell}</Stack>
            </PressScale>
          );
        })}
      </Row>
      {hint ? <SecondaryText>{hint}</SecondaryText> : null}
    </Stack>
  );
}
