/**
 * One panel row per person or bunch: avatar(s), names, status line and the arrival clock. The own
 * row carries PAUSE / RESUME; with location off it reads "Location off · Settings".
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { AvatarStack } from '@/ui/people/AvatarStack';
import { Row, Stack, Text, useTheme } from '@/ui';
import { makeStyles } from '@/ui/theme';

import type { PersonView } from '../data/view-model';
import { EtaClock } from './eta-clock';
import { PauseChip } from './pause-chip';

const useStyles = makeStyles((th) => ({
  row: {
    alignItems: 'center',
    gap: th.space['12'],
    paddingVertical: th.space['8'],
    borderBottomWidth: 1,
    borderBottomColor: th.color.divider,
  },
  text: { flex: 1 },
  dim: { opacity: 0.55 },
}));

export interface RowModel {
  readonly key: string;
  readonly people: readonly PersonView[];
  readonly title: string;
  readonly status: string;
  readonly clock: string | null;
  readonly estimate: boolean;
  readonly spoken: string;
}

export function MemberRow({
  row,
  mine,
  locationOff,
  onPause,
  onOpenSettings,
}: {
  readonly row: RowModel;
  readonly mine: boolean;
  readonly locationOff: boolean;
  readonly onPause?: (() => void) | undefined;
  readonly onOpenSettings?: (() => void) | undefined;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const lead = row.people[0];
  const dim = lead?.sharing !== 'live' && !mine;
  return (
    <Row style={[styles.row, dim ? styles.dim : null]} testID={`live-row-${row.key}`}>
      <AvatarStack
        members={row.people.map((person) => ({
          key: person.uid,
          name: person.name,
          joinIndex: person.joinIndex,
        }))}
        max={3}
        size="md"
      />
      <Stack gap="2" style={styles.text} accessible accessibilityLabel={row.spoken}>
        <Text variant="rowTitle" numberOfLines={1}>
          {row.title}
        </Text>
        {mine && locationOff ? (
          <Text
            variant="bodySm"
            color={theme.semantic.text.secondary}
            numberOfLines={1}
            onPress={onOpenSettings}
            accessibilityRole="link"
            testID="live-location-off"
          >
            {t({ id: 'liveMap.row.locationOff', message: 'Location off · Settings' })}
          </Text>
        ) : (
          <Text variant="bodySm" color={theme.semantic.text.secondary} numberOfLines={1}>
            {row.status}
          </Text>
        )}
      </Stack>
      {mine && onPause !== undefined && lead !== undefined && lead.sharing !== 'off' ? (
        <PauseChip paused={lead.sharing === 'paused'} onPress={onPause} />
      ) : (
        <View>
          <EtaClock
            value={row.clock}
            estimate={row.estimate}
            label={
              row.clock === null
                ? t({ id: 'liveMap.row.noEta', message: 'No arrival time' })
                : t({ id: 'liveMap.row.arrives', message: `Arrives ${row.clock}` })
            }
          />
        </View>
      )}
    </Row>
  );
}
