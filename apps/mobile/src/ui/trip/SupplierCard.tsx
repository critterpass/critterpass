import type { ReactNode } from 'react';

import { SecondaryText } from '../cards/SecondaryText';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { ActionPill } from '../plan/ActionPill';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface SupplierField {
  readonly label: string;
  /** Rendered exactly as the supplier sent it: no casing, rounding or reformatting. */
  readonly value: string;
}

export interface SupplierCardProps {
  /** Product name as the supplier titles it. */
  readonly title: string;
  readonly fields: readonly SupplierField[];
  /** Price string as the supplier formats it. */
  readonly price?: string;
  /** Supplier logo, as the partner terms require. */
  readonly logo?: ReactNode;
  /** Required attribution line ("Prices and availability from Klook"). */
  readonly attribution: string;
  /** Affiliate disclosure slot, supplied by the feature from server copy. */
  readonly disclosure?: ReactNode;
  readonly cta?: { readonly label: string; readonly onPress: () => void };
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  card: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    padding: th.space['14'],
    gap: th.space['10'],
  },
  field: {
    justifyContent: 'space-between',
    gap: th.space['12'],
    paddingVertical: th.space['4'],
    borderBottomWidth: th.space['2'] / 2,
    borderBottomColor: th.color.divider,
  },
}));

/**
 * Live supplier data shown verbatim with its attribution and disclosure. Purely presentational: it
 * takes the fetched fields as props and holds nothing, so nothing here can outlive the response.
 */
export function SupplierCard({
  title,
  fields,
  price,
  logo,
  attribution,
  disclosure,
  cta,
  testID,
}: SupplierCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Stack style={styles.card} testID={testID}>
      <Row gap="10" align="center">
        <Text variant="rowTitle" style={{ flex: 1 }}>
          {title}
        </Text>
        {price ? (
          <Text variant="rowTitle" color={theme.semantic.action.primary}>
            {price}
          </Text>
        ) : null}
      </Row>
      <Stack>
        {fields.map((field) => (
          <Row
            key={field.label}
            style={styles.field}
            accessible
            accessibilityRole="text"
            accessibilityLabel={`${field.label}: ${field.value}`}
          >
            <SecondaryText>{field.label}</SecondaryText>
            <Text variant="bodySm" style={{ flexShrink: 1, textAlign: 'right' }}>
              {field.value}
            </Text>
          </Row>
        ))}
      </Stack>
      <Row gap="8" align="center">
        {logo}
        <SecondaryText variant="caption" style={{ flex: 1 }}>
          {attribution}
        </SecondaryText>
      </Row>
      {disclosure}
      {cta ? (
        <ActionPill
          tone="primary"
          label={cta.label}
          accessibilityLabel={`${cta.label}, ${title}`}
          onPress={cta.onPress}
        />
      ) : null}
    </Stack>
  );
}
