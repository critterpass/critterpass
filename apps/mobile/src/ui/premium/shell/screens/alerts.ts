/**
 * The two-choice alert (foundations-spec §1): the question as the title, the result as the line,
 * Cancel always there. On iOS it is the system alert, so a destructive choice takes the system's
 * destructive style and Cancel sits where the platform puts it. On Android it is the designed
 * confirm card (3.15) instead of the stock Material dialog. An irreversible action uses
 * `HoldToConfirm` instead; its screen-reader path lands here.
 */
import type { ReactNode } from 'react';
import { Alert, Platform } from 'react-native';

import { dialogQueue, type DialogOption } from './dialog-queue';

export interface TwoChoiceAlert {
  /** The question ("Remove Ana from the trip?"). */
  readonly title: string;
  /** What happens ("She keeps her own bookings."). */
  readonly message: string;
  /** The action ("Remove"). */
  readonly confirm: string;
  /** The way back ("Cancel", "Keep editing"). */
  readonly cancel: string;
  /** The action destroys or blocks something. @default true */
  readonly destructive?: boolean;
  /** Who the question is about, over the title of the drawn card (3.15's avatar). */
  readonly badge?: ReactNode;
}

/** The designed dialogs replace the system's on Android; iOS keeps its own. */
const DRAWN = Platform.OS === 'android';

/** Shows the alert; resolves true only when the action was chosen (Cancel or dismissing is false). */
export function confirmAlert({
  title,
  message,
  confirm,
  cancel,
  destructive = true,
  badge,
}: TwoChoiceAlert): Promise<boolean> {
  const drawn = DRAWN
    ? dialogQueue.show({
        kind: 'confirm',
        title,
        message,
        confirm,
        cancel,
        destructive,
        ...(badge === undefined ? {} : { badge }),
      })
    : null;
  if (drawn !== null) return drawn;
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancel, style: 'cancel', onPress: () => resolve(false) },
        {
          text: confirm,
          style: destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/** A notice with one way on ("The trip is full" · Got it); resolves once it is closed. */
export async function noticeAlert(input: {
  readonly title: string;
  readonly message?: string | undefined;
  readonly ok: string;
}): Promise<void> {
  const drawn = DRAWN ? dialogQueue.show({ kind: 'notice', ...input }) : null;
  if (drawn !== null) {
    await drawn;
    return;
  }
  await new Promise<void>((resolve) => {
    Alert.alert(input.title, input.message, [{ text: input.ok, onPress: () => resolve() }], {
      cancelable: true,
      onDismiss: () => resolve(),
    });
  });
}

/**
 * A list of actions on one thing (7.15: a booking's options), with Close apart from them. An
 * action runs when it is chosen. The designed bottom sheet on both platforms: iOS's own alert
 * with these buttons is a small centred dialog, where the design rises a sheet from the bottom.
 * The system alert stays only where no dialog host is mounted.
 */
export function optionsAlert(input: {
  readonly header?: string | undefined;
  readonly options: readonly DialogOption[];
  readonly close: string;
}): void {
  const drawn = dialogQueue.show({ kind: 'options', ...input });
  if (drawn !== null) return;
  Alert.alert(
    input.header ?? '',
    undefined,
    [
      ...input.options.map((option) => ({
        text: option.label,
        onPress: option.run,
        style: option.destructive === true ? ('destructive' as const) : ('default' as const),
      })),
      { text: input.close, style: 'cancel' as const },
    ],
    { cancelable: true },
  );
}
