/**
 * Adding a booking by hand (`edit/new`, optionally prefilled from an import that could not be
 * read) or correcting one; its state and save are `useBookingForm`.
 */
import { BookingFormView } from './BookingFormView';
import { BookingMissing } from './BookingMissing';
import { useBookingForm } from './use-booking-form';

export { NEW_BOOKING_ID } from './use-booking-form';

export function BookingFormScreen(props: {
  readonly bookingId: string;
  readonly kind?: string | undefined;
  readonly title?: string | undefined;
  /** The confirmation that could not be read: it leaves the list once this booking is saved. */
  readonly candidateId?: string | undefined;
}) {
  const form = useBookingForm(props);
  if (form.kind === 'missing') return <BookingMissing loaded={form.loaded} />;
  return (
    <BookingFormView
      mode={form.adding ? 'add' : 'edit'}
      draft={form.draft}
      problems={form.problems}
      showProblems={form.tried}
      saving={form.saving}
      zones={form.zones}
      trip={form.trip}
      onChange={form.onChange}
      onSave={form.save}
    />
  );
}
