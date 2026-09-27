import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles, MIN_TOUCH_TARGET, useTheme } from '../theme';

export type AttachmentThumbProps = { readonly testID?: string } & (
  | {
      /** Screenshot or photo preview. */
      readonly preview: ReactNode;
      /** What it is ("Screenshot of Budget"). */
      readonly label: string;
      /** Peels the attachment off. */
      readonly onRemove: () => void;
    }
  | { readonly onAdd: () => void; readonly addLabel?: string }
);

const useStyles = makeStyles((th) => ({
  thumb: {
    width: th.space['32'] * 2,
    height: th.space['32'] * 2 + th.space['16'],
    borderRadius: th.radius.md,
    overflow: 'hidden',
    backgroundColor: th.semantic.bg.raised,
  },
  add: {
    borderWidth: th.space['2'],
    borderStyle: 'dashed',
    borderColor: th.semantic.border.decorative,
    alignItems: 'center',
    justifyContent: 'center',
  },
  remove: {
    position: 'absolute',
    top: -th.space['8'],
    end: -th.space['8'],
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeDot: {
    width: th.space['24'],
    height: th.space['24'],
    borderRadius: th.space['12'],
    backgroundColor: th.color.paper.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

/** An attached screenshot or photo with a peel-off ×, or the dashed add slot. */
export function AttachmentThumb(props: AttachmentThumbProps) {
  const styles = useStyles();
  const theme = useTheme();
  if ('onAdd' in props) {
    return (
      <PressScale
        testID={props.testID}
        accessibilityLabel={
          props.addLabel ?? t({ id: 'common.chat.addAttachment', message: 'Add attachment' })
        }
        onPress={props.onAdd}
        style={[styles.thumb, styles.add]}
      >
        <Text variant="h3" color={theme.semantic.text.secondary}>
          +
        </Text>
      </PressScale>
    );
  }
  const label = props.label;
  return (
    <View testID={props.testID}>
      <View style={styles.thumb} accessible accessibilityRole="image" accessibilityLabel={label}>
        {props.preview}
      </View>
      <PressScale
        accessibilityLabel={t({ id: 'common.chat.removeAttachment', message: `Remove ${label}` })}
        onPress={props.onRemove}
        widthClass="narrow"
        style={styles.remove}
      >
        <View style={styles.removeDot}>
          <Text variant="label" color={theme.color.paper.ink}>
            ×
          </Text>
        </View>
      </PressScale>
    </View>
  );
}
