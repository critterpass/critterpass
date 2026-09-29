import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';

import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { ActionPill } from '../plan/ActionPill';
import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface ImportSource {
  readonly id: string;
  /** "Forward". */
  readonly label: string;
  /** "Any email". */
  readonly detail: string;
  readonly color: string;
  readonly icon?: ReactNode;
  readonly onPress: () => void;
}

export interface ImportTilesProps {
  readonly sources: readonly ImportSource[];
  /** The crew's forwarding address, shown verbatim with a copy action. */
  readonly address?: { readonly value: string; readonly onCopy: () => void };
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  tile: {
    flex: 1,
    borderRadius: th.radius.lg,
    padding: th.space['14'],
    gap: th.space['6'],
    minHeight: th.space['32'] * 3,
  },
  address: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.md,
    paddingStart: th.space['14'],
    paddingEnd: th.space['4'],
    paddingVertical: th.space['4'],
    alignItems: 'center',
  },
}));

/** How a booking gets in: coloured source tiles and the copyable forwarding address. */
export function ImportTiles({ sources, address, testID }: ImportTilesProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Stack gap="10" testID={testID}>
      <Row gap="10">
        {sources.map((source) => (
          <PressScale
            key={source.id}
            accessibilityLabel={`${source.label}, ${source.detail}`}
            onPress={source.onPress}
            widthClass="medium"
            style={[styles.tile, { backgroundColor: source.color }]}
          >
            {source.icon}
            <Text variant="title" color={theme.semantic.text.onAccent}>
              {source.label}
            </Text>
            <Text variant="bodySm" color={theme.semantic.text.onAccent}>
              {source.detail}
            </Text>
          </PressScale>
        ))}
      </Row>
      {address ? (
        <Row gap="8" style={styles.address}>
          <Text variant="monoData" style={{ flex: 1 }} selectable numberOfLines={1}>
            {address.value}
          </Text>
          <ActionPill
            tone="primary"
            label={t({ id: 'common.trip.copy', message: 'Copy' })}
            accessibilityLabel={t({
              id: 'common.trip.copyAddress',
              message: `Copy ${address.value}`,
            })}
            onPress={address.onCopy}
          />
        </Row>
      ) : null}
    </Stack>
  );
}
