/**
 * PING ALL and I'M ON MY WAY. Both need the network (a late ping is worse than none), so offline
 * they are disabled with a line saying why. The controller sends and shows the island toast.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import type { PingAllResult } from '@cp/domain';

import { PillButton } from '@/ui/buttons/PillButton';
import { Row, Stack, Text, useTheme } from '@/ui';

/** What the crew got, for the island toast. */
export function pingToast(result: PingAllResult, time: string | null): string {
  if (result.kind === 'on_my_way') {
    const minutes = result.eta_min;
    return minutes === null
      ? t({ id: 'liveMap.toast.onMyWay', message: 'The crew can see you coming.' })
      : t({
          id: 'liveMap.toast.onMyWayEta',
          message: `The crew can see you coming. ${minutes} minutes.`,
        });
  }
  const place = result.place_name;
  return place === null || time === null
    ? t({ id: 'liveMap.toast.pinged', message: 'Pinged everyone.' })
    : t({ id: 'liveMap.toast.pingedMeetup', message: `Pinged everyone: ${place} at ${time}.` });
}

export function PingActions({
  offline,
  pending,
  onPing,
}: {
  readonly offline: boolean;
  readonly pending: boolean;
  readonly onPing: (kind: 'ping' | 'on_my_way') => void;
}) {
  const theme = useTheme();
  return (
    <Stack gap="8">
      <Row style={{ gap: theme.space['10'] }}>
        <View style={{ flex: 1 }}>
          <PillButton
            label={t({ id: 'liveMap.actions.pingAll', message: 'Ping all' })}
            variant="secondary"
            disabled={offline || pending}

            onPress={() => onPing('ping')}
            block
            testID="live-ping-all"
          />
        </View>
        <View style={{ flex: 1 }}>
          <PillButton
            label={t({ id: 'liveMap.actions.onMyWay', message: "I'm on my way" })}
            tone="yellow"
            disabled={offline || pending}
            // eslint-disable-next-line lingui/no-unlocalized-strings -- a wire value, never copy.
            onPress={() => onPing('on_my_way')}
            block
            testID="live-on-my-way"
          />
        </View>
      </Row>
      {offline ? (
        <Text
          variant="caption"
          color={theme.semantic.text.secondary}
          style={{ textAlign: 'center' }}
        >
          {t({ id: 'liveMap.actions.needsSignal', message: 'Pings need a signal.' })}
        </Text>
      ) : null}
    </Stack>
  );
}
