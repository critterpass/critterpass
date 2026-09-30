/**
 * Booking a Viator activity in the app (undesigned; built from the sheet, fields and pills): pick
 * how many go, ask Viator to hold it, add the lead traveller, pay in Viator's own form, then the
 * result. Every status line comes from the copy rules, so "held" appears only while Viator reports
 * a hold, and "Booked" only once Viator confirmed it.
 */
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';

import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { Segmented } from '@/ui/inputs/Segmented';
import { TextField } from '@/ui/inputs/TextField';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import { HoldTimer } from './HoldTimer';

export type BookingStep =
  | 'choose'
  | 'details'
  | 'paying'
  | 'pending_operator'
  | 'confirmed'
  | 'rejected'
  | 'hold_expired'
  | 'unavailable';

export interface TravellerDetails {
  readonly first: string;
  readonly last: string;
  readonly phone: string;
  readonly email: string;
}

export interface BookingSheetProps {
  readonly step: BookingStep;
  readonly title: string;
  readonly dateLabel: string;
  readonly travellers: number;
  readonly onTravellers: (count: number) => void;
  /** The copy-rule line for the hold ("4 seats held until 14:20", "Book now · seats not held"). */
  readonly holdLine: string | null;
  readonly holdUntil: string | null;
  readonly onHoldExpired: () => void;
  readonly details: TravellerDetails;
  readonly onDetails: (details: TravellerDetails) => void;
  /** The result line ("Booked · Viator ref BR-1", "Waiting for the operator"). */
  readonly resultLine: string | null;
  readonly busy: boolean;
  readonly error: string | null;
  /** The payment form, while paying. */
  readonly payment?: ReactNode;
  readonly onHold: () => void;
  readonly onPay: () => void;
  readonly onRelease: () => void;
  readonly onOpenLink: () => void;
  readonly onDone: () => void;
}

const COUNTS = [1, 2, 3, 4, 5, 6] as const;

export function detailsComplete(details: TravellerDetails): boolean {
  return (
    details.first.trim() !== '' &&
    details.last.trim() !== '' &&
    /^\+?[0-9 ()-]{6,24}$/u.test(details.phone.trim())
  );
}

export function BookingSheet(props: BookingSheetProps) {
  const theme = useTheme();
  const { t } = useLingui();
  const { step, details } = props;
  const set = (patch: Partial<TravellerDetails>) => props.onDetails({ ...details, ...patch });
  return (
    <Stack gap="16" testID={`supplier-book-${step}`}>
      <Stack gap="4">
        <Text variant="rowTitle">{props.title}</Text>
        <Text variant="bodySm" color={theme.semantic.text.secondary}>
          {props.dateLabel}
        </Text>
      </Stack>
      {props.holdLine || props.holdUntil ? (
        <Row gap="8" align="center" style={{ flexWrap: 'wrap' }}>
          {props.holdLine ? (
            <Text variant="body" testID="supplier-book-hold-line" style={{ flexShrink: 1 }}>
              {props.holdLine}
            </Text>
          ) : null}
          {props.holdUntil ? (
            <HoldTimer until={props.holdUntil} onExpired={props.onHoldExpired} />
          ) : null}
        </Row>
      ) : null}
      {step === 'choose' ? (
        <>
          <Segmented
            label={t({ id: 'suppliers.book.howMany', message: 'How many are going' })}
            segments={COUNTS.map((count) => ({ value: String(count), label: String(count) }))}
            value={String(props.travellers)}
            onChange={(value) => props.onTravellers(Number(value))}
          />
          <Text variant="caption" color={theme.semantic.text.secondary}>
            {t({
              id: 'suppliers.book.holdNote',
              message:
                'Viator holds the seats when it can. If it can’t, you can still book straight away.',
            })}
          </Text>
          <PillButton
            label={t({ id: 'suppliers.book.check', message: 'Check with Viator' })}
            onPress={props.onHold}
            loading={props.busy}
            testID="supplier-book-check"
          />
        </>
      ) : null}
      {step === 'details' ? (
        <>
          <Text variant="eyebrow" color={theme.semantic.text.secondary}>
            {t({ id: 'suppliers.book.lead', message: 'LEAD TRAVELLER' })}
          </Text>
          <TextField
            label={t({ id: 'suppliers.book.first', message: 'First name' })}
            value={details.first}
            onChangeText={(first) => set({ first })}
            autoComplete="given-name"
            testID="supplier-book-first"
          />
          <TextField
            label={t({ id: 'suppliers.book.last', message: 'Last name' })}
            value={details.last}
            onChangeText={(last) => set({ last })}
            autoComplete="family-name"
            testID="supplier-book-last"
          />
          <TextField
            label={t({ id: 'suppliers.book.phone', message: 'Phone' })}
            value={details.phone}
            onChangeText={(phone) => set({ phone })}
            keyboardType="phone-pad"
            autoComplete="tel"
            testID="supplier-book-phone"
          />
          <TextField
            label={t({ id: 'suppliers.book.email', message: 'Email (optional)' })}
            value={details.email}
            onChangeText={(email) => set({ email })}
            keyboardType="email-address"
            autoCapitalize="none"
            testID="supplier-book-email"
          />
          <PillButton
            label={t({ id: 'suppliers.book.pay', message: 'Pay with Viator' })}
            onPress={props.onPay}
            loading={props.busy}
            disabled={!detailsComplete(details)}
            testID="supplier-book-pay"
          />
          <TextLink
            label={t({ id: 'suppliers.book.release', message: 'Let it go' })}
            onPress={props.onRelease}
            testID="supplier-book-release"
          />
        </>
      ) : null}
      {step === 'paying' ? props.payment : null}
      {step === 'pending_operator' || step === 'confirmed' || step === 'rejected' ? (
        <>
          <Text variant="h3" testID="supplier-book-result">
            {props.resultLine ?? ''}
          </Text>
          <Text variant="body" color={theme.semantic.text.secondary}>
            {step === 'confirmed'
              ? t({
                  id: 'suppliers.book.inWallet',
                  message: 'The voucher is in your wallet, and the cost is in the crew’s expenses.',
                })
              : step === 'pending_operator'
                ? t({
                    id: 'suppliers.book.operatorNote',
                    message:
                      'The operator confirms most bookings within a day. I’ll tell you when they do.',
                  })
                : t({
                    id: 'suppliers.book.rejectedNote',
                    message:
                      'Viator couldn’t book it and nothing was charged. Try another time or day.',
                  })}
          </Text>
          <PillButton
            label={t({ id: 'suppliers.book.done', message: 'Done' })}
            onPress={props.onDone}
            testID="supplier-book-done"
          />
        </>
      ) : null}
      {step === 'hold_expired' ? (
        <>
          <Text variant="h3">
            {t({ id: 'suppliers.book.expired', message: 'The hold ran out — check again' })}
          </Text>
          <PillButton
            label={t({ id: 'suppliers.book.checkAgain', message: 'Check again' })}
            onPress={props.onHold}
            loading={props.busy}
            testID="supplier-book-check-again"
          />
        </>
      ) : null}
      {step === 'unavailable' ? (
        <>
          <Text variant="body">
            {t({
              id: 'suppliers.book.unavailable',
              message:
                'Viator isn’t taking bookings in the app right now. You can still book it on their site.',
            })}
          </Text>
          <PillButton
            label={t({ id: 'suppliers.book.openViator', message: 'Open Viator ↗' })}
            onPress={props.onOpenLink}
            loading={props.busy}
            testID="supplier-book-open-link"
          />
        </>
      ) : null}
      {props.error ? (
        <Text variant="caption" color={theme.semantic.state.urgent} testID="supplier-book-error">
          {props.error}
        </Text>
      ) : null}
    </Stack>
  );
}
