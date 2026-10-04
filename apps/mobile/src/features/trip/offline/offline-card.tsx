/**
 * The top card with no signal (3k-4): night blue with a halftone, the day's eyebrow, a NO SIGNAL
 * chip that blinks (BACK ONLINE in green once the queue has sent), the headline from the nearest
 * place of the day ("Offline at Batur summit"), the line about what was saved and when, and the
 * guide floating beside it.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useLocale } from '@/lib/i18n/use-locale';
import { useLoop } from '@/motion/use-loop';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { Card } from '@/ui/cards/Card';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import type { GuideId } from '@/ui/people/GuideLine';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

const STICKER = 96;

export type SignalChip = 'offline' | 'weak' | 'back' | 'online';

export interface OfflineCardProps {
  readonly eyebrow: string;
  readonly headline: string;
  readonly line: string;
  readonly chip: SignalChip;
  readonly guide: GuideId;
}

const useStyles = makeStyles((th) => ({
  card: { backgroundColor: th.color.ink['700'] },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space['6'],
    paddingHorizontal: th.space['10'],
    paddingVertical: th.space['4'],
    borderRadius: th.space['16'],
    backgroundColor: th.color.ink['900'],
  },
  dot: { width: th.space['8'], height: th.space['8'], borderRadius: th.space['8'] },
}));

function Chip({ chip }: { readonly chip: SignalChip }) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const blink = useLoop('blink', { active: chip === 'offline' });
  const colour =
    chip === 'back' || chip === 'online'
      ? theme.semantic.state.success
      : chip === 'weak'
        ? theme.color.orange
        : theme.color.yellow;
  const label =
    chip === 'online'
      ? t({ id: 'trip.offline.online', message: 'Online' })
      : chip === 'back'
        ? t({ id: 'trip.offline.backOnline', message: 'Back online' })
        : chip === 'weak'
          ? t({ id: 'trip.offline.weak', message: 'Weak signal' })
          : t({ id: 'trip.offline.noSignal', message: 'No signal' });
  return (
    <View style={styles.chip} accessibilityLiveRegion="polite" testID={`trip-offline-chip-${chip}`}>
      <Animated.View
        style={[styles.dot, { backgroundColor: colour }, chip === 'offline' ? blink : null]}
      />
      <Text variant="label" color={colour}>
        {upper(label, locale)}
      </Text>
    </View>
  );
}

export function OfflineCard({ eyebrow, headline, line, chip, guide }: OfflineCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const float = useLoop('float');
  const sticker = GUIDE_STICKERS[guide];
  return (
    <Card tone="sunken" halftone radius="cardBig" style={styles.card} testID="trip-offline-card">
      <Stack gap="12">
        <Row justify="space-between" align="center">
          <Text variant="eyebrow">{upper(eyebrow, locale)}</Text>
          <Chip chip={chip} />
        </Row>
        <Row gap="12" align="center">
          <Stack gap="10" flex={1}>
            {/* A place's name can be long ("Chợ Hàn (Han Market)"): up to three fitted lines. */}
            <Text
              variant="displayHero"
              autoFit
              numberOfLines={3}
              color={theme.semantic.text.primary}
            >
              {upper(headline, locale)}
            </Text>
            <Text variant="body" color={theme.semantic.text.primary}>
              {line}
            </Text>
          </Stack>
          <Animated.View style={float}>
            <Sticker kind={sticker.kind} name={sticker.name} size={STICKER} />
          </Animated.View>
        </Row>
      </Stack>
    </Card>
  );
}
