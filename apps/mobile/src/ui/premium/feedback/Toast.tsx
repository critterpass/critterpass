import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { Icon } from '../icons/Icon';
import { PressableScale } from '../motion/PressableScale';
import { Avatar } from '../people/Avatar';
import { CritterSticker } from '../stickers/CritterSticker';
import { Text } from '../text/Text';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';
import type { PremiumTheme } from '../theme/theme';

/**
 * `done` the ink toast with a mint check (and glass Undo); `critter` a white toast led by a critter;
 * `error` the pink-tinted "!" toast; `person` a white toast with a 40 avatar and two lines.
 */
export type ToastSpec =
  | { readonly kind: 'done'; readonly message: string; readonly undo?: () => void }
  | {
      readonly kind: 'critter';
      readonly message: string;
      readonly critter: { readonly kind: string; readonly name: string };
      readonly undo?: () => void;
    }
  | { readonly kind: 'error'; readonly message: string }
  | {
      readonly kind: 'person';
      readonly title: string;
      readonly subtitle?: string;
      readonly person: { readonly name: string; readonly color: string };
    };

/** What the toast says, for the screen reader announcement. */
export function toastText(spec: ToastSpec): string {
  if (spec.kind === 'person') {
    return spec.subtitle === undefined ? spec.title : `${spec.title}. ${spec.subtitle}`;
  }
  return spec.message;
}

function UndoPill({
  theme,
  ink,
  onPress,
}: {
  theme: PremiumTheme;
  ink: boolean;
  onPress: () => void;
}) {
  const label = t({ id: 'common.toast.undo', message: 'Undo' });
  return (
    <PressableScale onPress={onPress} accessibilityLabel={label}>
      <View
        style={{
          height: theme.size.pill,
          paddingHorizontal: theme.space.rowPadH,
          borderRadius: theme.radius.pill,
          backgroundColor: ink ? theme.color.inkToastAction : theme.color.control,
          justifyContent: 'center',
        }}
      >
        <Text variant="toastAction" color={ink ? theme.color.onInkSurface : theme.color.ink}>
          {label}
        </Text>
      </View>
    </PressableScale>
  );
}

export interface ToastProps {
  readonly spec: ToastSpec;
  /** Called after Undo runs, so the host can take the toast away. */
  readonly onDone?: () => void;
  readonly testID?: string;
}

/** One 58-high toast (r29). The host stacks them above the tab bar. */
export function Toast({ spec, onDone, testID }: ToastProps) {
  const theme = usePremiumTheme();
  const c = theme.color;
  const undo = (fn: () => void) => () => {
    fn();
    onDone?.();
  };
  const base = {
    minHeight: theme.size.toast,
    borderRadius: theme.radius.toast,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.space.gap10,
  };

  switch (spec.kind) {
    case 'done':
      return (
        <View
          testID={testID}
          style={{
            ...base,
            backgroundColor: c.inkSurface,
            boxShadow: theme.shadow.toastInk,
            paddingStart: theme.space.gap10,
            paddingEnd: theme.space.gap8,
          }}
        >
          <View
            style={{
              width: theme.size.toastCheck,
              height: theme.size.toastCheck,
              borderRadius: theme.size.toastCheck / 2,
              backgroundColor: theme.signal.successCheck,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="check" size={theme.size.glyph} color={c.onAccent} />
          </View>
          <Text variant="toast" color={c.onInkSurface} style={{ flex: 1 }}>
            {spec.message}
          </Text>
          {spec.undo === undefined ? null : (
            <UndoPill theme={theme} ink onPress={undo(spec.undo)} />
          )}
        </View>
      );
    case 'critter':
      return (
        <View
          testID={testID}
          style={{
            ...base,
            backgroundColor: c.card,
            boxShadow: theme.shadow.toast,
            paddingStart: theme.space.gap6,
            paddingEnd: theme.space.gap8,
          }}
        >
          <CritterSticker
            kind={spec.critter.kind}
            name={spec.critter.name}
            size={theme.size.toastCritter}
          />
          <Text variant="rowTextStrong" style={{ flex: 1 }}>
            {spec.message}
          </Text>
          {spec.undo === undefined ? null : (
            <UndoPill theme={theme} ink={false} onPress={undo(spec.undo)} />
          )}
        </View>
      );
    case 'error':
      return (
        <View
          testID={testID}
          style={{
            ...base,
            backgroundColor: c.banner.error.bg,
            paddingHorizontal: theme.space.gap16,
          }}
        >
          <View
            style={{
              width: theme.size.errorDisc,
              height: theme.size.errorDisc,
              borderRadius: theme.size.errorDisc / 2,
              backgroundColor: theme.signal.errorDisc,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text variant="errorMark" tone="onAccent" accessible={false}>
              !
            </Text>
          </View>
          <Text variant="rowTextStrong" color={c.banner.error.text} style={{ flex: 1 }}>
            {spec.message}
          </Text>
        </View>
      );
    case 'person':
      return (
        <View
          testID={testID}
          style={{
            ...base,
            backgroundColor: c.card,
            boxShadow: theme.shadow.toast,
            paddingStart: theme.space.gap8,
            paddingEnd: theme.space.gap16,
          }}
        >
          <Avatar name={spec.person.name} color={spec.person.color} size={theme.size.avatarLarge} />
          <View style={{ flex: 1 }}>
            <Text variant="rowTextStrong">{spec.title}</Text>
            {spec.subtitle === undefined ? null : (
              <Text variant="captionMuted" tone="muted">
                {spec.subtitle}
              </Text>
            )}
          </View>
        </View>
      );
  }
}
