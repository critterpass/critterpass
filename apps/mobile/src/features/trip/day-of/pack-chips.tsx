/**
 * PACK (3k-2): the day's chips. Tap ticks one (pen strike + a small pop), the dot on one of my own
 * removes it, and "+ Add" opens an inline field for a personal row (only I see it).
 */
import { tokens } from '@cp/design-tokens';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useEffect, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useLocale } from '@/lib/i18n/use-locale';
import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { Icon } from '@/ui/icons/Icon';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { PressScale } from '@/ui/press/PressScale';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { toast } from '@/motion/island-toast';
import { useInputFont } from '@/ui/inputs/use-input-font';

import type { PackChip } from './packing-model';
import { PEN_STRIKE_MS, PenStrike } from './pen-strike';

const useStyles = makeStyles((th) => ({
  chip: {
    minHeight: th.size.chip.height,
    borderRadius: th.size.chip.height,
    paddingHorizontal: th.space['14'],
    justifyContent: 'center',
    borderWidth: th.space['2'],
  },
  input: {
    minWidth: th.space['32'] * 4,
    color: th.semantic.text.primary,
    paddingVertical: 0,
  },
}));

function Chip({
  chip,
  onToggle,
  onRemove,
}: {
  readonly chip: PackChip;
  readonly onToggle: (id: string, packed: boolean) => void;
  readonly onRemove: (id: string) => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const reduced = useReducedImpactMotion();
  const scale = useSharedValue(1);
  const was = useRef(chip.packed);
  useEffect(() => {
    if (chip.packed && !was.current && !reduced) {
      scale.value = withSequence(
        withTiming(1, { duration: PEN_STRIKE_MS }),
        withTiming(1.08, { duration: tokens.motion.duration.instant }),
        withTiming(1, { duration: tokens.motion.duration.instant }),
      );
    }
    was.current = chip.packed;
  }, [chip.packed, reduced, scale]);
  const pop = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const { label } = chip;
  const ink = chip.packed ? theme.semantic.text.secondary : theme.semantic.action.primary;
  return (
    <Animated.View style={pop}>
      <PressScale
        accessibilityRole="checkbox"
        accessibilityLabel={
          chip.personal
            ? t({ id: 'trip.dayOf.pack.personal', message: `${label}, just you` })
            : label
        }
        accessibilityState={{ checked: chip.packed }}
        onPress={() => onToggle(chip.id, !chip.packed)}
        widthClass="narrow"
        testID={`trip-day-pack-${chip.id}`}
        style={[
          styles.chip,
          chip.packed
            ? { backgroundColor: theme.semantic.bg.control, borderColor: theme.semantic.bg.control }
            : { backgroundColor: theme.semantic.bg.base, borderColor: ink },
        ]}
      >
        <Row gap="6" align="center">
          {chip.packed ? (
            <Icon name="check" size={16} decorative color={theme.semantic.state.success} />
          ) : null}
          <View>
            <Text variant="buttonSm" color={ink}>
              {upper(chip.label, locale)}
            </Text>
            <PenStrike drawn={chip.packed} color={ink} />
          </View>
          {chip.personal && !chip.packed ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t({ id: 'trip.dayOf.pack.remove', message: `Remove ${label}` })}
              hitSlop={theme.space['12']}
              onPress={() => onRemove(chip.id)}
              testID={`trip-day-pack-remove-${chip.id}`}
            >
              <Icon name="circle" size={12} decorative color={ink} />
            </Pressable>
          ) : null}
        </Row>
      </PressScale>
    </Animated.View>
  );
}

export interface PackChipsProps {
  readonly chips: readonly PackChip[];
  readonly onToggle: (id: string, packed: boolean) => void;
  readonly onAdd: (label: string) => void;
  readonly onRemove: (id: string) => void;
}

export function PackChips({ chips, onToggle, onAdd, onRemove }: PackChipsProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const inputFont = useInputFont();
  // The remove dot is small and one tap: the toast gives the item back.
  const remove = (id: string) => {
    const gone = chips.find((chip) => chip.id === id);
    onRemove(id);
    if (gone === undefined) return;
    const name = gone.label;
    toast.show({
      // eslint-disable-next-line lingui/no-unlocalized-strings -- a toast key, never copy.
      id: `pack-removed-${id}`,
      title: t({ id: 'trip.dayOf.pack.removed', message: `Removed ${name}` }),
      action: {
        label: t({ id: 'trip.dayOf.pack.undo', message: 'Undo' }),
        onPress: () => onAdd(name),
      },
    });
  };
  const submit = () => {
    const trimmed = label.trim();
    if (trimmed !== '') onAdd(trimmed);
    setLabel('');
    setAdding(false);
  };
  return (
    <Stack gap="10" testID="trip-day-pack">
      <Text variant="eyebrow" accessibilityRole="header">
        {upper(t({ id: 'trip.dayOf.pack.title', message: 'Pack' }), locale)}
      </Text>
      {chips.length === 0 && !adding ? (
        <Text variant="bodySm" color={theme.semantic.text.secondary}>
          {t({ id: 'trip.dayOf.pack.empty', message: 'Nothing on the list yet.' })}
        </Text>
      ) : null}
      <Row gap="8" wrap>
        {chips.map((chip) => (
          <Chip key={chip.id} chip={chip} onToggle={onToggle} onRemove={remove} />
        ))}
        {adding ? (
          <View
            style={[
              styles.chip,
              { borderColor: theme.semantic.border.control, borderStyle: 'dashed' },
            ]}
          >
            <TextInput
              autoFocus
              value={label}
              onChangeText={setLabel}
              // Return blurs the field, so the add happens once, on blur.
              onBlur={submit}
              maxLength={80}
              returnKeyType="done"
              placeholder={t({ id: 'trip.dayOf.pack.placeholder', message: 'Headlamp' })}
              placeholderTextColor={theme.semantic.text.secondary}
              accessibilityLabel={t({ id: 'trip.dayOf.pack.addLabel', message: 'Add to pack' })}
              allowFontScaling={false}
              style={[styles.input, inputFont]}
              testID="trip-day-pack-input"
            />
          </View>
        ) : (
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={t({ id: 'trip.dayOf.pack.addLabel', message: 'Add to pack' })}
            onPress={() => setAdding(true)}
            widthClass="narrow"
            testID="trip-day-pack-add"
            style={[
              styles.chip,
              { borderColor: theme.semantic.border.control, borderStyle: 'dashed' },
            ]}
          >
            <Text variant="buttonSm" color={theme.semantic.text.secondary}>
              {upper(t({ id: 'trip.dayOf.pack.add', message: '+ Add' }), locale)}
            </Text>
          </PressScale>
        )}
      </Row>
    </Stack>
  );
}
