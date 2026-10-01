/**
 * The trip egg on the PASS tab: resting until landing, wobbling with HATCH IT once the trip is
 * under way, or a nudge to meet a critter that hatched while the ceremony hasn't played here.
 */
import { View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { Card } from '@/ui/cards/Card';
import { Egg } from '@/ui/critters/Egg';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import { eggReady, eggUnseen, eggWaiting } from './hatch-copy';
import type { EggCard as EggCardModel } from './hatch-model';

export interface EggCardProps {
  readonly egg: EggCardModel;
  readonly onHatch: () => void;
  readonly onOpen: () => void;
  readonly busy?: boolean;
}

export function EggCard({ egg, onHatch, onOpen, busy = false }: EggCardProps) {
  const theme = useTheme();
  const copy =
    egg.kind === 'waiting'
      ? { ...eggWaiting(egg.place), cta: null }
      : egg.kind === 'ready'
        ? eggReady(egg.place)
        : eggUnseen();
  const colour = egg.colour ?? theme.semantic.action.primary;
  return (
    <Card tone="raised" testID={`critters-egg-${egg.kind}`}>
      <Row gap="14" align="center">
        <View style={{ width: 56, alignItems: 'center' }}>
          <Egg state={egg.kind === 'waiting' ? 'resting' : 'wobbling'} size={52} color={colour} />
        </View>
        <Stack gap="4" flex={1}>
          <Text variant="title">{copy.title}</Text>
          <Text variant="bodySm" color={theme.semantic.text.secondary}>
            {copy.body}
          </Text>
          {copy.cta === null ? null : (
            <View style={{ alignSelf: 'flex-start', marginTop: theme.space['6'] }}>
              <PillButton
                label={copy.cta}
                size="sm"
                loading={busy}
                onPress={egg.kind === 'ready' ? onHatch : onOpen}
                testID={egg.kind === 'ready' ? 'critters-egg-hatch' : 'critters-egg-meet'}
              />
            </View>
          )}
        </Stack>
      </Row>
    </Card>
  );
}
