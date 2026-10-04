import { View } from 'react-native';

import type { Tier } from '../chips/TierLabel';
import { Avatar as MemberAvatar, type AvatarSize } from '../people/Avatar';
import { CritterAvatar } from '../people/CritterAvatar';
import { Sticker } from '../sticker/Sticker';
import { Text } from '../text/Text';
import { makeStyles, sizeToken, useTheme } from '../theme';
import { guideSticker, type GuideAvatarId } from './guides';
import { PhotoAvatar } from './PhotoAvatar';

/** Moderation of a photo avatar; critter and initials avatars are always `approved`. */
export type PhotoReview = 'pending' | 'approved' | 'rejected';

export type AvatarView =
  | { readonly kind: 'initials' }
  | { readonly kind: 'guide'; readonly guide: GuideAvatarId }
  | {
      readonly kind: 'critter';
      readonly critterKind: string;
      readonly critterName: string;
      readonly tier: Tier;
    }
  | {
      readonly kind: 'photo';
      readonly uri: string;
      readonly cutout: boolean;
      readonly review: PhotoReview;
    };

export interface UserAvatarProps {
  readonly name: string;
  readonly avatar: AvatarView;
  /**
   * `self` sees their own pending photo (with the review badge); everyone else sees initials until
   * the photo is approved. A rejected photo shows initials to everyone.
   */
  readonly viewer: 'self' | 'others';
  /** @default 'lg' */
  readonly size?: AvatarSize;
  readonly joinIndex?: number;
  /** Badge copy for the owner's pending ("Under review") or rejected ("Not approved") photo. */
  readonly reviewLabel?: string;
  readonly testID?: string;
}

const useStyles = makeStyles((t) => ({
  badge: {
    position: 'absolute',
    bottom: -t.space['6'],
    alignSelf: 'center',
    paddingHorizontal: t.space['6'],
    paddingVertical: t.space['2'],
    borderRadius: t.radius.pill,
    backgroundColor: t.semantic.bg.raised,
  },
}));

/** Which avatar actually renders for this viewer (photo moderation decides it). */
export function visibleAvatar(avatar: AvatarView, viewer: 'self' | 'others'): AvatarView {
  if (avatar.kind !== 'photo') return avatar;
  if (avatar.review === 'approved') return avatar;
  if (avatar.review === 'pending' && viewer === 'self') return avatar;
  return { kind: 'initials' };
}

/**
 * Everyone's avatar, everywhere (chat, map pins, manifests, votes): a critter sticker in its rarity
 * ring, a guide sticker, a cut-out photo, or initials in the member colour as the fallback.
 */
export function UserAvatar({
  name,
  avatar,
  viewer,
  size = 'lg',
  joinIndex = 0,
  reviewLabel,
  testID,
}: UserAvatarProps) {
  const styles = useStyles();
  const theme = useTheme();
  const diameter = sizeToken(theme.size.avatar, size);
  const shown = visibleAvatar(avatar, viewer);
  const showReview =
    viewer === 'self' && avatar.kind === 'photo' && avatar.review !== 'approved' && reviewLabel;

  let body;
  if (shown.kind === 'guide') {
    const guide = guideSticker(shown.guide);
    body = (
      <MemberAvatar
        name={name}
        joinIndex={joinIndex}
        size={size}
        critter={<Sticker kind={guide.kind} name={guide.name} size={diameter} />}
        {...(testID ? { testID: `${testID}-guide` } : {})}
      />
    );
  } else if (shown.kind === 'critter') {
    body = (
      <CritterAvatar
        name={shown.critterName}
        tier={shown.tier}
        size={diameter + 8}
        sticker={<Sticker kind={shown.critterKind} name={shown.critterName} size={diameter} />}
        {...(testID ? { testID: `${testID}-critter` } : {})}
      />
    );
  } else if (shown.kind === 'photo') {
    body = (
      <PhotoAvatar
        uri={shown.uri}
        size={diameter + 8}
        cutout={shown.cutout}
        dimmed={shown.review === 'pending'}
        {...(testID ? { testID: `${testID}-photo` } : {})}
      />
    );
  } else {
    body = (
      <MemberAvatar
        name={name}
        joinIndex={joinIndex}
        size={size}
        {...(testID ? { testID: `${testID}-initials` } : {})}
      />
    );
  }

  return (
    <View testID={testID}>
      {body}
      {showReview ? (
        <View style={styles.badge}>
          <Text variant="label" color={theme.semantic.text.secondary}>
            {reviewLabel}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
