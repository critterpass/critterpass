import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';

import { SecondaryText } from '../cards/SecondaryText';
import { Row } from '../layout/Row';
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
}));

export function formLabel(tier: Tier, found: boolean): string {
  const word = tierWord(tier);
  return found
    ? t({ id: 'common.critter.formFound', message: `${word} form, found` })
    : t({ id: 'common.critter.formMissing', message: `${word} form, not found yet` });
}

/** The local critter's four forms for where you are now, found ones in colour, with a hint. */
export function HereNowForms({ title, subtitle, forms, hint, testID }: HereNowFormsProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Stack style={styles.card} testID={testID}>
      <Row justify="space-between" align="baseline" accessible accessibilityRole="header">
        <Text variant="h3" color={theme.semantic.action.primary}>
          {title}
        </Text>
        {subtitle ? <Text variant="label">{subtitle}</Text> : null}
      </Row>
      <Row gap="8">
        {forms.map((form) => (
          <Stack
            key={form.tier}
            style={styles.cell}
            accessible
            accessibilityRole="image"
            accessibilityLabel={formLabel(form.tier, form.found)}
          >
            {form.sticker}
            <TierWord tier={form.tier} glyph={false} />
          </Stack>
        ))}
      </Row>
      {hint ? <SecondaryText>{hint}</SecondaryText> : null}
    </Stack>
  );
}
