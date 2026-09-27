import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';

import { SecondaryText } from '../cards/SecondaryText';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { ActionPill } from '../plan/ActionPill';
import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface EmergencyNumber {
  /** Dialled number, verbatim ("112"). */
  readonly number: string;
  /** "Ambulance, police, fire". */
  readonly label: string;
  readonly onCall: () => void;
}

export interface ProblemTile {
  readonly id: string;
  /** "Hurt or sick". */
  readonly label: string;
  readonly icon?: ReactNode;
  readonly onPress: () => void;
}

export interface EmergencyTilesProps {
  readonly primary: EmergencyNumber;
  /** Tourist police or similar. */
  readonly secondary?: EmergencyNumber;
  readonly problems: readonly ProblemTile[];
  /** Nearest clinic row. */
  readonly clinic?: {
    readonly name: string;
    readonly detail: string;
    readonly actionLabel: string;
    readonly onGo: () => void;
  };
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  call: {
    flex: 2,
    backgroundColor: th.color.paper.base,
    borderRadius: th.radius.lg,
    padding: th.space['16'],
  },
  side: {
    flex: 1,
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    padding: th.space['16'],
  },
  tile: {
    width: '48%',
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    padding: th.space['14'],
    gap: th.space['8'],
  },
  clinic: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    padding: th.space['14'],
  },
}));

/** Help screen: call the emergency number, the secondary line, problem tiles and the nearest clinic. */
export function EmergencyTiles({
  primary,
  secondary,
  problems,
  clinic,
  testID,
}: EmergencyTilesProps) {
  const styles = useStyles();
  const theme = useTheme();
  const callLabel = (entry: EmergencyNumber) => {
    const { number, label } = entry;
    return t({ id: 'common.trip.callNumber', message: `Call ${number}, ${label}` });
  };
  return (
    <Stack gap="10" testID={testID}>
      <Row gap="10">
        <PressScale
          accessibilityLabel={callLabel(primary)}
          onPress={primary.onCall}
          widthClass="wide"
          style={styles.call}
        >
          <Text variant="h2" color={theme.color.paper.ink}>
            {t({ id: 'common.trip.callShort', message: `Call ${primary.number}` })}
          </Text>
          <Text variant="bodySm" color={theme.color.paper.muted}>
            {primary.label}
          </Text>
        </PressScale>
        {secondary ? (
          <PressScale
            accessibilityLabel={callLabel(secondary)}
            onPress={secondary.onCall}
            widthClass="medium"
            style={styles.side}
          >
            <Text variant="h2">{secondary.number}</Text>
            <SecondaryText>{secondary.label}</SecondaryText>
          </PressScale>
        ) : null}
      </Row>
      <Row gap="10" wrap justify="space-between">
        {problems.map((problem) => (
          <PressScale
            key={problem.id}
            accessibilityLabel={problem.label}
            onPress={problem.onPress}
            widthClass="medium"
            style={styles.tile}
          >
            {problem.icon}
            <Text variant="title">{problem.label}</Text>
          </PressScale>
        ))}
      </Row>
      {clinic ? (
        <Row gap="12" align="center" style={styles.clinic}>
          <Stack
            gap="2"
            flex={1}
            accessible
            accessibilityRole="text"
            accessibilityLabel={`${clinic.name}, ${clinic.detail}`}
          >
            <Text variant="title">{clinic.name}</Text>
            <SecondaryText>{clinic.detail}</SecondaryText>
          </Stack>
          <ActionPill
            tone="success"
            label={clinic.actionLabel}
            accessibilityLabel={`${clinic.actionLabel}, ${clinic.name}`}
            onPress={clinic.onGo}
          />
        </Row>
      ) : null}
    </Stack>
  );
}
