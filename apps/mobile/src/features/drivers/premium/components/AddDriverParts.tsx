/**
 * Add a driver's pieces, in the source-card style of Find a driver (6.19): the three ways in as
 * tiles (the picked one ringed in ink), and what the crew already shared as a list card with each
 * item's state as a status tag.
 */
import type { IntakeItem } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { crewAccent, IconTile, type LineIconName } from '@/features/trip';
import {
  Avatar,
  ListCard,
  PressableScale,
  ring,
  Row,
  StatusTag,
  Text,
  usePremiumTheme,
  type StatusTone,
} from '@/ui/premium';

export interface SourceTileProps {
  readonly icon: LineIconName;
  readonly tint: { readonly bg: string; readonly text: string };
  readonly title: string;
  readonly detail: string;
  readonly on: boolean;
  readonly onPress: () => void;
  readonly testID: string;
}

export function SourceTile(props: SourceTileProps) {
  const th = usePremiumTheme();
  return (
    <PressableScale
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: props.on }}
      accessibilityLabel={`${props.title}, ${props.detail}`}
      style={styles.flex}
      testID={props.testID}
    >
      <View
        style={[
          styles.tile,
          {
            borderRadius: th.radius.card,
            backgroundColor: th.color.card,
            boxShadow: props.on ? ring(2, th.color.ink) : th.shadow.card,
          },
        ]}
      >
        <IconTile name={props.icon} bg={props.tint.bg} color={props.tint.text} />
        <Text variant="rowTitle">{props.title}</Text>
        <Text variant="caption" tone="muted">
          {props.detail}
        </Text>
      </View>
    </PressableScale>
  );
}

/** The shared item as its server state says: shortlisted, unreadable, ready to check, or new. */
function useBadge(): (item: IntakeItem) => { readonly label: string; readonly tone: StatusTone } {
  const { t } = useLingui();
  return (item) =>
    item.status === 'used'
      ? {
          label: t({ id: 'drivers.add.badge.shortlisted', message: 'Shortlisted' }),
          tone: 'booked',
        }
      : item.status === 'failed'
        ? {
            label: t({ id: 'drivers.add.badge.unread', message: 'Couldn’t read' }),
            tone: 'tangerine',
          }
        : item.status === 'parsed'
          ? { label: t({ id: 'drivers.add.badge.check', message: 'Check it' }), tone: 'maybe' }
          : { label: t({ id: 'drivers.add.badge.new', message: 'New' }), tone: 'unopened' };
}

export function SharedList({
  guideName,
  items,
  onOpen,
}: {
  readonly guideName: string;
  readonly items: readonly IntakeItem[];
  readonly onOpen: (intakeId: string) => void;
}) {
  const { t } = useLingui();
  const badge = useBadge();
  const count = items.length;
  return (
    <View style={styles.list}>
      <Text variant="captionMuted" tone="muted">
        {t({ id: 'drivers.premium.add.shared', message: `Shared with ${guideName} · ${count}` })}
      </Text>
      <ListCard testID="drivers-add-shared">
        {items.map((item, index) => {
          const label =
            item.parsed?.card.name ??
            (item.kind === 'image'
              ? t({ id: 'drivers.add.kindImage', message: 'Screenshot' })
              : t({ id: 'drivers.add.kindText', message: 'Message' }));
          const by = item.shared_by_name ?? '';
          const tag = badge(item);
          return (
            <Row
              key={item.id}
              title={label}
              subtitle={t({ id: 'drivers.premium.add.sharedBy', message: `shared by ${by}` })}
              leading={<Avatar name={label} color={crewAccent(index + 2)} size={36} />}
              trailing={<StatusTag label={tag.label} tone={tag.tone} />}
              onPress={() => onOpen(item.id)}
              testID={`drivers-add-item-${index}`}
            />
          );
        })}
      </ListCard>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tile: { minHeight: 132, padding: 12, gap: 6 },
  list: { gap: 6 },
});
