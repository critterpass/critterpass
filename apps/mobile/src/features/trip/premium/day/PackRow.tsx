/**
 * The day's pack list as chips (6.04): packed in ink with a mint check, still to pack on white with
 * an empty ring; a tap packs or unpacks, a long press takes off one of your own. "+ Add" opens a
 * field in place; Done adds it and keeps the field for the next, and leaving the field adds what
 * was typed rather than throwing it away.
 */
import { useLingui } from '@lingui/react/macro';
import { memo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  hitSlopFor,
  Icon,
  IconButton,
  PressableScale,
  ring,
  Text,
  TextField,
  usePremiumTheme,
} from '@/ui/premium';

import type { PackChip } from '../../day-of/packing-model';

/** The 34 pt chips reach the 44 pt touch target above and below. */
const CHIP_SLOP = hitSlopFor(44, 34);

export const PackRow = memo(function PackRow(props: {
  readonly chips: readonly PackChip[];
  readonly onToggle: (id: string, packed: boolean) => void;
  readonly onAdd: (label: string) => void;
  readonly onRemove: (id: string) => void;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const submit = () => {
    const label = text.trim();
    if (label !== '') props.onAdd(label);
    setText('');
  };
  return (
    <View style={{ gap: th.space.gap8, paddingHorizontal: th.space.gutter }} testID="trip-day-pack">
      <Text variant="label" tone="muted">
        {t({ id: 'trip.dayOf.premium.pack', message: 'Pack' })}
      </Text>
      <View style={styles.wrap}>
        {props.chips.map((chip) => (
          <PressableScale
            key={chip.id}
            onPress={() => props.onToggle(chip.id, !chip.packed)}
            hitSlop={CHIP_SLOP}
            {...(chip.personal ? { onLongPress: () => props.onRemove(chip.id) } : {})}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: chip.packed }}
            accessibilityLabel={chip.label}
            {...(chip.personal
              ? {
                  accessibilityHint: t({
                    id: 'trip.dayOf.premium.packHint',
                    message: 'Hold to remove it',
                  }),
                }
              : {})}
            testID={`trip-day-pack-${chip.id}`}
          >
            <View
              style={[
                styles.chip,
                chip.packed
                  ? { backgroundColor: th.color.ink }
                  : { backgroundColor: th.color.card, boxShadow: th.shadow.float },
                chip.pending ? styles.pending : null,
              ]}
            >
              <View
                style={[
                  styles.mark,
                  chip.packed
                    ? { backgroundColor: th.accent.mint }
                    : { boxShadow: ring(2, th.color.outlineEmpty, true) },
                ]}
              >
                {chip.packed ? <Icon name="check" size={12} color={th.color.onAccent} /> : null}
              </View>
              <Text variant="pillSmall" color={chip.packed ? th.color.onInk : th.color.ink}>
                {chip.label}
              </Text>
            </View>
          </PressableScale>
        ))}
        {adding ? null : (
          <PressableScale
            onPress={() => setAdding(true)}
            hitSlop={CHIP_SLOP}
            accessibilityRole="button"
            accessibilityLabel={t({
              id: 'trip.dayOf.premium.addPack',
              message: 'Add something to pack',
            })}
            testID="trip-day-pack-add"
          >
            <View
              style={[
                styles.chip,
                { borderWidth: 1.5, borderStyle: 'dashed', borderColor: th.color.outlineEmpty },
              ]}
            >
              <Text variant="pillSmall" tone="muted">
                {t({ id: 'trip.dayOf.premium.addShort', message: '+ Add' })}
              </Text>
            </View>
          </PressableScale>
        )}
      </View>
      {adding ? (
        <View style={[styles.field, { gap: th.space.gap8 }]}>
          <View style={styles.input}>
            <TextField
              accessibilityLabel={t({
                id: 'trip.dayOf.premium.addPack',
                message: 'Add something to pack',
              })}
              placeholder={t({
                id: 'trip.dayOf.premium.packPlaceholder',
                message: 'Headlamp, jacket…',
              })}
              value={text}
              onChangeText={setText}
              autoFocus
              returnKeyType="done"
              submitBehavior="submit"
              onSubmitEditing={submit}
              onBlur={() => {
                submit();
                setAdding(false);
              }}
              testID="trip-day-pack-field"
            />
          </View>
          {/* The add beside the field, so adding never depends on finding the keyboard's key. */}
          <IconButton
            icon="plus"
            tone="ink"
            disabled={text.trim() === ''}
            label={t({ id: 'trip.dayOf.premium.addPackGo', message: 'Add it' })}
            onPress={submit}
            testID="trip-day-pack-submit"
          />
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    height: 34,
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 8,
    paddingRight: 12,
  },
  mark: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  pending: { opacity: 0.7 },
  field: { flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1 },
});
