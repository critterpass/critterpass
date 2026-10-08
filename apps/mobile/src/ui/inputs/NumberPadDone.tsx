import { t } from '@lingui/core/macro';
import { useEffect, useId, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { InputAccessoryView, Keyboard, Platform } from 'react-native';
import type { TextInputProps } from 'react-native';

import { Row } from '../layout/Row';
import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles, MIN_TOUCH_TARGET, useTheme } from '../theme';

/** The one accessory every number pad shares (iOS ties a field to it by this id). */
export const NUMBER_PAD_DONE_ID = 'number-pad-done';

/** Keyboards without a return key: iPhone shows no way to put them away. */
const PADS = new Set<string>(['number-pad', 'decimal-pad', 'numeric', 'phone-pad']);
const PAD_MODES = new Set<string>(['numeric', 'decimal', 'tel']);

/** Whether a field opens a keyboard with no return key of its own. */
export function opensNumberPad({
  keyboardType,
  inputMode,
}: Pick<TextInputProps, 'keyboardType' | 'inputMode'>): boolean {
  return PADS.has(keyboardType ?? '') || PAD_MODES.has(inputMode ?? '');
}

// The number fields on screen, oldest first: the oldest mounts the accessory for all of them, and
// when it leaves the next one takes over, so the bar is mounted once however many fields there are.
let fields: readonly string[] = [];
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const firstField = () => fields[0];

const useStyles = makeStyles((t) => ({
  bar: {
    justifyContent: 'flex-end',
    backgroundColor: t.semantic.bg.raised,
    borderTopWidth: 1,
    borderTopColor: t.semantic.border.decorative,
    paddingHorizontal: t.size.gutter,
  },
  done: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: t.space['8'] },
}));

function DoneBar() {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <InputAccessoryView nativeID={NUMBER_PAD_DONE_ID}>
      <Row style={styles.bar}>
        <PressScale
          testID="number-pad-done"
          widthClass="narrow"
          onPress={() => Keyboard.dismiss()}
          accessibilityLabel={t({ id: 'common.icon.done', message: 'Done' })}
          style={styles.done}
        >
          <Text variant="label" color={theme.semantic.action.primary}>
            {t({ id: 'common.icon.done', message: 'Done' })}
          </Text>
        </PressScale>
      </Row>
    </InputAccessoryView>
  );
}

/**
 * The Done key above an iPhone number pad. A field that opens one passes the returned id to its
 * input and renders `accessory`, which is the shared bar for the oldest such field and nothing for
 * the rest. Android's number pads have their own key to close them, so it is iOS only.
 */
export function useNumberPadDone(props: Pick<TextInputProps, 'keyboardType' | 'inputMode'>): {
  readonly inputAccessoryViewID: string | undefined;
  readonly accessory: ReactNode;
} {
  const id = useId();
  const enabled = Platform.OS === 'ios' && opensNumberPad(props);
  useEffect(() => {
    if (!enabled) return undefined;
    fields = [...fields, id];
    notify();
    return () => {
      fields = fields.filter((field) => field !== id);
      notify();
    };
  }, [enabled, id]);
  const owner = useSyncExternalStore(subscribe, firstField, firstField);
  return {
    inputAccessoryViewID: enabled ? NUMBER_PAD_DONE_ID : undefined,
    accessory: enabled && owner === id ? <DoneBar /> : null,
  };
}
