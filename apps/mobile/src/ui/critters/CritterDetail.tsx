import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Card } from '../cards/Card';
import type { CardTone } from '../cards/tone';
import { SecondaryText } from '../cards/SecondaryText';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';
import type { Tier } from './tier';
import { tierLine, tierWord } from './tier';

export interface CritterFact {
  readonly label: string;
  readonly value: string;
}

export interface CritterDetailProps {
  readonly name: string;
  readonly tier: Tier;
  /** "Water temples". */
  readonly habitat?: string;
  /** Critterdex number, shown as "#112". */
  readonly dexNumber: number;
  readonly sticker: ReactNode;
  /** Card colour (the form's colour). @default 'green' */
  readonly tone?: CardTone;
  /** Avatars of who else has it. */
  readonly owners?: ReactNode;
  /** The guide's field note (voice line). */
  readonly fieldNote?: string;
  readonly fieldNoteSource?: string;
  readonly guideColor?: string;
  readonly facts?: readonly CritterFact[];
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  header: { justifyContent: 'space-between', alignItems: 'center' },
  pill: {
    backgroundColor: th.semantic.bg.base,
    borderRadius: th.radius.sm,
    paddingHorizontal: th.space['8'],
    paddingVertical: th.space['4'],
  },
  art: { alignItems: 'center', paddingVertical: th.space['8'] },
  nameRow: { alignItems: 'flex-end', gap: th.space['8'] },
  name: { flex: 1, minWidth: 0 },
  fact: {
    flex: 1,
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.md,
    padding: th.space['10'],
    gap: th.space['2'],
  },
}));

/** Critter card: tier chip, number, sticker, name, owners, the guide's field note and fact tiles. */
export function CritterDetail({
  name,
  tier,
  habitat,
  dexNumber,
  sticker,
  tone = 'green',
  owners,
  fieldNote,
  fieldNoteSource,
  guideColor,
  facts = [],
  testID,
}: CritterDetailProps) {
  const styles = useStyles();
  const theme = useTheme();
  const word = tierWord(tier);
  const numberLabel = t({ id: 'common.critter.dexNumber', message: `Number ${dexNumber}` });
  return (
    <Stack gap="12" testID={testID}>
      <Card tone={tone} halftone radius="cardBig">
        <Stack
          accessible
          accessibilityRole="header"
          accessibilityLabel={[name, tierLine(tier, habitat), numberLabel].join(', ')}
        >
          <Row style={styles.header}>
            <View style={styles.pill}>
              <Text variant="label" color={theme.tier[tier].color}>
                {habitat ? `${word} · ${habitat}` : word}
              </Text>
            </View>
            <Text variant="h3">{`#${dexNumber}`}</Text>
          </Row>
          <View style={styles.art}>{sticker}</View>
          {/* The owners keep their own width beside the name, which fits (then wraps) into the
              rest, so the two never overlap (3l-3). */}
          <Row style={styles.nameRow}>
            <View style={styles.name}>
              <Text variant="displayXl" autoFit>
                {name}
              </Text>
            </View>
            {owners ?? null}
          </Row>
        </Stack>
      </Card>
      {fieldNote ? (
        <Stack gap="4">
          <Text variant="voice" color={guideColor ?? theme.semantic.state.success}>
            {fieldNote}
          </Text>
          {fieldNoteSource ? <SecondaryText>{fieldNoteSource}</SecondaryText> : null}
        </Stack>
      ) : null}
      {facts.length > 0 ? (
        <Row gap="8">
          {facts.map((fact) => (
            <Stack
              key={fact.label}
              style={styles.fact}
              accessible
              accessibilityRole="text"
              accessibilityLabel={`${fact.label}: ${fact.value}`}
            >
              <Text variant="eyebrow">{fact.label}</Text>
              <Text variant="rowTitle" numberOfLines={2}>
                {fact.value}
              </Text>
            </Stack>
          ))}
        </Row>
      ) : null}
    </Stack>
  );
}
