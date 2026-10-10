/**
 * The two-choice alert (foundations-spec §1): the question as the title, the result as the line,
 * Cancel always there. It is the system alert, so a destructive choice takes the system's
 * destructive style (iOS draws it red, not the design's pink) and Cancel sits where the platform
 * puts it. An irreversible action uses `HoldToConfirm` instead; its screen-reader path lands here.
 */
import { Alert } from 'react-native';

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
}

/** Shows the alert; resolves true only when the action was chosen (Cancel or dismissing is false). */
export function confirmAlert({
  title,
  message,
  confirm,
  cancel,
  destructive = true,
}: TwoChoiceAlert): Promise<boolean> {
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
