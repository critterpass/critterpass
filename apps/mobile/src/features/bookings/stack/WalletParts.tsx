/**
 * Pieces of the wallet page (3h-1): the green "✓ 9 OFFLINE" badge and the dashed import banner
 * ("Found 2 bookings in Alex's inbox that weren't here yet. REVIEW") with Tokek cheering.
 */
import { upper } from '@cp/i18n';
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { TextLink } from '@/ui/buttons/TextLink';
import { Icon } from '@/ui/icons/Icon';
import { Row } from '@/ui/layout/Row';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

const useStyles = makeStyles((t) => ({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['6'],
    paddingHorizontal: t.space['12'],
    paddingVertical: t.space['6'],
    borderRadius: t.radius.md,
    backgroundColor: t.color.green.base,
  },
  banner: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: t.semantic.border.decorative,
    borderRadius: t.radius.lg,
    padding: t.space['14'],
  },
  bannerLine: { flex: 1 },
}));

export function OfflineBadge({ count }: { readonly count: number }) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const label = t({
    id: 'bookings.offline.count',
    message: plural(count, { one: '# offline', other: '# offline' }),
  });
  return (
    <View
      style={styles.badge}
      accessible
      accessibilityLabel={t({
        id: 'bookings.offline.a11y',
        message: plural(count, {
          one: '# booking ready without signal',
          other: '# bookings ready without signal',
        }),
      })}
      testID="bookings-offline-badge"
    >
      <Icon name="check" size={16} color={theme.semantic.text.onAccent} decorative />
      <Text variant="label" color={theme.semantic.text.onAccent}>
        {upper(label, locale)}
      </Text>
    </View>
  );
}

export interface ImportBannerProps {
  readonly count: number;
  /** Whose inbox they came from; null when they are all the member's own. */
  readonly member: string | null;
  readonly onReview: () => void;
}

export function ImportBanner({ count, member, onReview }: ImportBannerProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const tokek = GUIDE_STICKERS.tokek;
  const line =
    member === null
      ? t({
          id: 'bookings.banner.mine',
          message: plural(count, {
            one: "Found # booking in your inbox that wasn't here yet.",
            other: "Found # bookings in your inbox that weren't here yet.",
          }),
        })
      : t({
          id: 'bookings.banner.member',
          message: plural(count, {
            one: `Found # booking in ${member}'s inbox that wasn't here yet.`,
            other: `Found # bookings in ${member}'s inbox that weren't here yet.`,
          }),
        });
  return (
    <Row gap="12" align="center" style={styles.banner} testID="bookings-import-banner">
      <Sticker kind={tokek.kind} name={tokek.name} size={44} pose="cheer" />
      <Text variant="voice" color={theme.color.yellow} style={styles.bannerLine}>
        {line}
      </Text>
      <TextLink
        label={upper(t({ id: 'bookings.banner.review', message: 'Review' }), locale)}
        onPress={onReview}
        testID="bookings-banner-review"
      />
    </Row>
  );
}
