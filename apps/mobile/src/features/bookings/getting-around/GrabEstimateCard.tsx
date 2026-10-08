/**
 * The ride card (3h-3, truthful): Grab's own estimate with OPEN GRAB when Grab gave one, else the
 * ride apps that run here as plain links, and our fare range labelled as an estimate when the api
 * has one. We never show a driver, a plate or a car on its way: nobody is booked by us.
 */
import { useLingui } from '@lingui/react/macro';
import { Pressable, View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { Icon } from '@/ui/icons/Icon';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Skeleton } from '@/ui/states/Skeleton';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { FareRow } from './fare-rows';

export interface RideAppButton {
  readonly key: string;
  readonly label: string;
  readonly onPress: () => void;
}

export interface GrabEstimateCardProps {
  readonly state: 'loading' | 'estimate' | 'links' | 'none' | 'offline';
  /** "Grab estimates Rp 90.000–120.000, about 4 min away", or "Call a car" for links. */
  readonly title: string;
  readonly detail?: string | null;
  /** Our tariff estimate per ride class, when Grab gave none. */
  readonly fares?: readonly FareRow[];
  readonly apps: readonly RideAppButton[];
  readonly testID?: string;
}

const BADGE = 52;

const useStyles = makeStyles((t) => ({
  badge: {
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    backgroundColor: t.color.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

export function GrabEstimateCard({
  state,
  title,
  detail,
  fares = [],
  apps,
  testID,
}: GrabEstimateCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  if (state === 'loading') {
    return (
      <Skeleton
        preset="list"
        repeat={1}
        label={t({ id: 'suppliers.rides.loading', message: 'Checking rides' })}
        testID="getting-around-ride-loading"
      />
    );
  }
  return (
    <Stack gap="12" testID={testID ?? `getting-around-ride-${state}`}>
      <Row gap="12" align="center">
        <View style={styles.badge}>
          <Icon name="car" size={30} color={theme.semantic.text.onAccent} decorative />
        </View>
        <Stack gap="2" style={{ flex: 1 }}>
          <Text variant="title">{title}</Text>
          {detail ? (
            <Text variant="bodySm" color={theme.semantic.text.secondary}>
              {detail}
            </Text>
          ) : null}
        </Stack>
      </Row>
      {fares.map((fare) => (
        <Stack key={fare.key} gap="2" testID="getting-around-fare-estimate">
          <Text variant="label" color={theme.semantic.text.secondary}>
            {fare.label}
          </Text>
          <Row gap="8" align="center" style={{ flexWrap: 'wrap' }}>
            <Text variant="body">{fare.line}</Text>
            <Pressable
              accessibilityRole="link"
              onPress={fare.onWhy}
              hitSlop={12}
              testID="getting-around-fare-why"
            >
              <Text
                variant="body"
                color={theme.semantic.text.secondary}
                style={{ textDecorationLine: 'underline' }}
              >
                {t({ id: 'suppliers.rides.whyEstimate', message: 'Why this estimate' })}
              </Text>
            </Pressable>
          </Row>
          {fare.crew ? (
            <Text variant="caption" color={theme.semantic.text.secondary}>
              {fare.crew}
            </Text>
          ) : null}
          {fare.extras.map((extra) => (
            <Text key={extra} variant="caption" color={theme.semantic.text.secondary}>
              {extra}
            </Text>
          ))}
        </Stack>
      ))}
      {apps.length > 0 ? (
        <Row gap="10">
          {apps.map((app) => (
            <View key={app.key} style={{ flex: 1 }}>
              <PillButton
                size="sm"
                tone="cream"
                block
                label={app.label}
                onPress={app.onPress}
                testID={`getting-around-open-${app.key}`}
              />
            </View>
          ))}
        </Row>
      ) : null}
    </Stack>
  );
}
