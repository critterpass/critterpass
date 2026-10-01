/**
 * Add a booking (3h-2): ← BOOKINGS, ADD A BOOKING, the FORWARD / SCAN / PASTE tiles, the crew's
 * forward address with COPY, the bookings found in the crew's inboxes (the first open, the rest
 * compact; ADD slides a card up into the wallet, IGNORE slides it off), and Tokek's footnote about
 * the morning inbox check, or the way to switch it on. Under the address "Got a code? Link your
 * email" opens the link-code sheet (undesigned), for mail forwarded from an address the crew does
 * not know yet, and a link opens the by-hand form (undesigned), for a booking with no confirmation
 * to forward, scan or paste.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { ScrollView } from 'react-native';
import Animated, { FadeOutUp, LinearTransition, SlideOutRight } from 'react-native-reanimated';

import { useLocale } from '@/lib/i18n/use-locale';
import { useMotionMode } from '@/motion/motion-mode';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { TextLink } from '@/ui/buttons/TextLink';
import { Stack } from '@/ui/layout/Stack';
import { GuideLine } from '@/ui/people/GuideLine';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { useTabBarInset } from '@/ui/shell/TabBar';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { CandidateCard } from '../candidates/CandidateCard';
import type { CandidateView } from '../candidates/candidate-model';
import type { ScanState } from '../scan/use-booking-scan';
import { AddressPill, ImportTiles, type ImportChannel } from './ImportTiles';
import { useScanLine } from './scan-line';

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: t.size.gutter, gap: t.space['16'], paddingTop: t.space['8'] },
}));

export interface AddBookingViewProps {
  readonly address: string | null;
  readonly candidates: readonly CandidateView[];
  readonly splits: Readonly<Record<string, boolean>>;
  readonly assembling: ReadonlySet<string>;
  /** How each resolved card leaves. */
  readonly leaving: Readonly<Record<string, 'add' | 'ignore'>>;
  readonly scan: ScanState;
  readonly mailboxConnected: boolean;
  readonly noTrip: boolean;
  readonly tz?: string | undefined;
  readonly onBack: () => void;
  readonly onChannel: (channel: ImportChannel) => void;
  readonly onCopy: (address: string) => Promise<void>;
  readonly onSplit: (id: string, next: boolean) => void;
  readonly onAdd: (id: string) => void;
  readonly onIgnore: (id: string) => void;
  readonly onByHand: (id: string) => void;
  /** Adding by hand with nothing read first. */
  readonly onTypeIn: () => void;
  readonly onMailbox: () => void;
  /** Enter the code an unknown forwarding address was emailed. */
  readonly onLinkCode: () => void;
}

export function AddBookingView(props: AddBookingViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const inset = useTabBarInset();
  const locale = useLocale();
  const { t } = useLingui();
  const [motionMode] = useMotionMode();
  const scanLine = useScanLine(props.scan);
  const tokek = GUIDE_STICKERS.tokek;
  const moving = motionMode !== 'off';
  const pending = props.candidates.filter((view) => view.state === 'pending');
  const firstPending = pending[0]?.id ?? null;
  return (
    <Scaffold variant="dark" testID="bookings-add">
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: inset + theme.space['32'] }]}
        keyboardShouldPersistTaps="handled"
      >
        <BackEyebrow
          label={upper(t({ id: 'bookings.back', message: 'Bookings' }), locale)}
          onPress={props.onBack}
        />
        <Text variant="h1" designSize={52} accessibilityRole="header">
          {upper(t({ id: 'bookings.add.title', message: 'Add a booking' }), locale)}
        </Text>
        <ImportTiles onChannel={props.onChannel} />
        {scanLine === null ? null : (
          <Text variant="bodySm" color={theme.semantic.text.secondary} testID="bookings-scan-line">
            {scanLine}
          </Text>
        )}
        {props.address === null ? null : (
          <AddressPill address={props.address} onCopy={props.onCopy} />
        )}
        {props.address === null ? null : (
          <TextLink
            label={t({ id: 'bookings.add.linkCode', message: 'Got a code? Link your email' })}
            onPress={props.onLinkCode}
            testID="bookings-add-link-code"
          />
        )}
        {props.noTrip ? null : (
          <TextLink
            label={t({ id: 'bookings.add.byHand', message: 'Or type it in by hand' })}
            onPress={props.onTypeIn}
            testID="bookings-add-by-hand"
          />
        )}
        {props.noTrip ? (
          <Text variant="body" color={theme.semantic.text.secondary} testID="bookings-add-no-trip">
            {t({
              id: 'bookings.add.noTrip',
              message: 'Bookings land in a trip. Start one with the crew and they show up here.',
            })}
          </Text>
        ) : null}
        {props.candidates.length === 0 ? null : (
          <Stack gap="10" testID="bookings-candidates">
            {pending.length === 0 ? null : (
              <Text variant="eyebrow">
                {upper(
                  pending.every((view) => view.broughtIn)
                    ? t({ id: 'bookings.add.read', message: `Ready to add · ${pending.length}` })
                    : t({
                        id: 'bookings.add.found',
                        message: `Found in your crew’s inboxes · ${pending.length}`,
                      }),
                  locale,
                )}
              </Text>
            )}
            {props.candidates.map((view) => (
              <Animated.View
                key={view.id}
                {...(moving
                  ? {
                      layout: LinearTransition,
                      exiting: props.leaving[view.id] === 'add' ? FadeOutUp : SlideOutRight,
                    }
                  : {})}
              >
                <CandidateCard
                  view={view}
                  variant={
                    view.id === firstPending || view.state !== 'pending' ? 'open' : 'compact'
                  }
                  split={props.splits[view.id] ?? view.canSplit}
                  assemble={props.assembling.has(view.id)}
                  tz={props.tz}
                  onSplit={(next) => props.onSplit(view.id, next)}
                  onAdd={() => props.onAdd(view.id)}
                  onIgnore={() => props.onIgnore(view.id)}
                  onByHand={() => props.onByHand(view.id)}
                />
              </Animated.View>
            ))}
          </Stack>
        )}
        <GuideLine
          guide="tokek"
          name={tokek.name}
          line={
            props.mailboxConnected
              ? t({
                  id: 'bookings.mailbox.footnote',
                  message:
                    'I check for new confirmations every morning. You can switch that off in Settings.',
                })
              : t({
                  id: 'bookings.add.mailboxOffer',
                  message: 'I can also check your inbox for new confirmations every morning.',
                })
          }
          sticker={<Sticker kind={tokek.kind} name={tokek.name} size={44} pose="point" />}
          testID="bookings-add-footnote"
        />
        {props.mailboxConnected ? null : (
          <TextLink
            label={t({ id: 'bookings.mailbox.title', message: 'Find bookings in my email' })}
            onPress={props.onMailbox}
            testID="bookings-add-mailbox"
          />
        )}
      </ScrollView>
    </Scaffold>
  );
}
