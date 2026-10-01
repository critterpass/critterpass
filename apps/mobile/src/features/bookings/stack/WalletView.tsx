/**
 * Bookings (3h-1): the BOOKINGS title with the offline badge, the card stack with the soonest
 * relevant booking open at the front, the "found in an inbox" banner, then (undesigned, from the
 * same components) the insurance card, "Add a booking" and the archive link. An empty wallet
 * shows the three import tiles inline; loading shows skeleton cards. The BOOKINGS | MONEY switch
 * above the title (undesigned) swaps to the Money half.
 */
import { upper } from '@cp/i18n';
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { TextLink } from '@/ui/buttons/TextLink';
import { DashedAddCard } from '@/ui/cards/DashedAddCard';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { GuideLine } from '@/ui/people/GuideLine';
import { PressScale } from '@/ui/press/PressScale';
import { useTabBarInset } from '@/ui/shell/TabBar';
import { Skeleton } from '@/ui/states/Skeleton';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, MIN_TOUCH_TARGET, useTheme } from '@/ui/theme';

import { ImportTiles, type ImportChannel } from '../add/ImportTiles';
import { BookingDeck, type DeckItem } from './BookingDeck';
import { ImportBanner, OfflineBadge, type ImportBannerProps } from './WalletParts';
import { WalletSwitch } from './WalletSwitch';
import { useWalletGuide } from '../data/wallet-guide';

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: t.size.gutter, gap: t.space['20'], paddingTop: t.space['8'] },
  title: { flexShrink: 1 },
  details: { alignSelf: 'flex-end', minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
}));

export interface WalletViewProps {
  readonly state: 'loading' | 'empty' | 'ready';
  readonly offlineCount: number;
  readonly closed: readonly DeckItem[];
  readonly open: { readonly key: string; readonly tone: DeckItem['tone'] } | null;
  /** The open booking's body (a flight card or a booking body). */
  readonly openBody: ReactNode;
  readonly banner: Omit<ImportBannerProps, 'onReview'> | null;
  readonly archiveCount: number;
  /** The insurance card slot. */
  readonly insurance?: ReactNode;
  readonly onSelect: (id: string) => void;
  readonly onOpenDetail: () => void;
  readonly onReview: () => void;
  readonly onAdd: () => void;
  readonly onChannel: (channel: ImportChannel) => void;
  readonly onArchive: () => void;
}

function Title({ offlineCount }: { readonly offlineCount: number }) {
  const styles = useStyles();
  const locale = useLocale();
  const { t } = useLingui();
  return (
    <Row justify="space-between" align="center" gap="12">
      <Text variant="h1" designSize={52} accessibilityRole="header" style={styles.title}>
        {upper(t({ id: 'bookings.title', message: 'Bookings' }), locale)}
      </Text>
      {offlineCount > 0 ? <OfflineBadge count={offlineCount} /> : null}
    </Row>
  );
}

export function WalletView(props: WalletViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const inset = useTabBarInset();
  const locale = useLocale();
  const { t } = useLingui();
  const guide = useWalletGuide();
  const tokek = GUIDE_STICKERS[guide.id];
  return (
    <Scaffold variant="dark" testID={`bookings-wallet-${props.state}`}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: inset + theme.space['32'] }]}
      >
        <WalletSwitch current="bookings" />
        <Title offlineCount={props.offlineCount} />
        {props.state === 'loading' ? (
          <Stack gap="8" testID="bookings-loading">
            <Skeleton
              preset="card"
              repeat={3}
              label={t({ id: 'bookings.loading', message: 'Loading your bookings' })}
            />
          </Stack>
        ) : null}
        {props.state === 'empty' ? (
          <Stack gap="16" testID="bookings-empty">
            <GuideLine
              guide={guide.id}
              name={guide.name}
              line={t({
                id: 'bookings.empty.line',
                message:
                  'Nothing in the wallet yet. Forward, scan or paste a confirmation and I file it here.',
              })}
              sticker={<Sticker kind={tokek.kind} name={guide.name} size={48} pose="wave" />}
            />
            <ImportTiles onChannel={props.onChannel} />
          </Stack>
        ) : null}
        {props.state === 'ready' ? (
          <Stack gap="12">
            <BookingDeck
              closed={props.closed}
              open={props.open}
              onSelect={props.onSelect}
              testID="bookings-stack"
            >
              {props.openBody}
              <PressScale
                onPress={props.onOpenDetail}
                widthClass="narrow"
                accessibilityLabel={t({
                  id: 'bookings.card.detailsA11y',
                  message: 'Booking details',
                })}
                style={styles.details}
                testID="bookings-open-details"
              >
                <Text variant="label" color={theme.semantic.text.onAccent}>
                  {`${upper(t({ id: 'bookings.card.details', message: 'Details' }), locale)} ›`}
                </Text>
              </PressScale>
            </BookingDeck>
          </Stack>
        ) : null}
        {props.banner === null ? null : (
          <ImportBanner {...props.banner} onReview={props.onReview} />
        )}
        {props.insurance ?? null}
        {props.state === 'ready' ? (
          <DashedAddCard
            label={t({ id: 'bookings.addCard', message: 'Add a booking' })}
            onPress={props.onAdd}
            testID="bookings-add"
          />
        ) : null}
        {props.archiveCount > 0 ? (
          <TextLink
            label={t({
              id: 'bookings.archive.link',
              message: plural(props.archiveCount, {
                one: '# past booking',
                other: '# past bookings',
              }),
            })}
            onPress={props.onArchive}
            testID="bookings-archive-link"
          />
        ) : null}
      </ScrollView>
    </Scaffold>
  );
}
