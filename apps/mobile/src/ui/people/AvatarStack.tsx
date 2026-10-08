import type { ReactNode } from 'react';
import { t } from '@lingui/core/macro';
import type { ImageSourcePropType } from 'react-native';
import { View } from 'react-native';

import { Text } from '../text/Text';
import { makeStyles, sizeToken, useTheme } from '../theme';
import { Avatar } from './Avatar';
import type { AvatarSize } from './Avatar';

export interface StackMember {
  readonly key: string;
  readonly name: string;
  /** The member's user id: the stack draws the face they chose. */
  readonly uid?: string | null | undefined;
  readonly joinIndex: number;
  readonly photo?: ImageSourcePropType;
  /** A sticker worn as the member's avatar (a guide), drawn inside the circle. */
  readonly critter?: ReactNode;
  readonly pending?: boolean;
}

export interface AvatarStackProps {
  readonly members: readonly StackMember[];
  /** Avatars shown before "+n". @default 4 */
  readonly max?: number;
  /** @default 'md' */
  readonly size?: AvatarSize;
  /** Overrides the default "Maya, Winston and 3 more" label. */
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

const OVERLAP = -7;

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', alignItems: 'center' },
  overlap: { marginStart: OVERLAP },
  more: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.semantic.bg.control,
    borderWidth: t.ring.cutout.widthPt,
    borderColor: t.semantic.bg.base,
  },
}));

/** Overlapping member avatars (−7 overlap) with a "+n" overflow, read as one list. */
export function AvatarStack({
  members,
  max = 4,
  size = 'md',
  accessibilityLabel,
  testID,
}: AvatarStackProps) {
  const styles = useStyles();
  const theme = useTheme();
  const shown = members.slice(0, max);
  const hidden = members.length - shown.length;
  const names = shown.map((member) => member.name).join(', ');
  const label =
    accessibilityLabel ??
    (hidden > 0
      ? t({ id: 'common.avatarStack.more', message: `${names} and ${hidden} more` })
      : names);
  const diameter = sizeToken(theme.size.avatar, size) + theme.ring.cutout.widthPt * 2;
  return (
    <View testID={testID} style={styles.row} accessible accessibilityLabel={label}>
      {shown.map((member, index) => (
        <View key={member.key} style={index > 0 ? styles.overlap : null}>
          <Avatar
            name={member.name}
            joinIndex={member.joinIndex}
            size={size}
            decorative
            {...(member.uid ? { uid: member.uid } : {})}
            {...(member.photo ? { photo: member.photo } : {})}
            {...(member.critter ? { critter: member.critter } : {})}
            {...(member.pending ? { pending: true } : {})}
          />
        </View>
      ))}
      {hidden > 0 ? (
        <View
          style={[
            styles.more,
            styles.overlap,
            { width: diameter, height: diameter, borderRadius: diameter / 2 },
          ]}
        >
          <Text variant="label" color={theme.semantic.text.primary}>{`+${hidden}`}</Text>
        </View>
      ) : null}
    </View>
  );
}
