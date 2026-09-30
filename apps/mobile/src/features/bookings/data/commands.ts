/**
 * Client specs for the wallet's commands. Adding, editing, deleting and sharing a booking, ADD /
 * IGNORE on a candidate, reporting a landing and deleting a policy may wait in the offline queue
 * (the cards update when their rows sync). Paste and scan imports need the server to read them,
 * and a policy is sealed on arrival, so those go online.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names, never copy. */
import type {
  AddBookingPayload,
  DeleteBookingPayload,
  EditBookingPayload,
  ImportPastePayload,
  ImportScanPayload,
  ResolveImportCandidatePayload,
} from '@cp/domain';
import { msg } from '@lingui/core/macro';

import { defineClientCommand } from '@/data/commands/summaries';

export const addBookingCommand = defineClientCommand<AddBookingPayload>({
  name: 'add_booking',
  offline: true,
  summarize: (payload) => {
    const title = payload.title;
    return msg({ id: 'bookings.queued.add', message: `Booking: ${title}` });
  },
});

export const editBookingCommand = defineClientCommand<EditBookingPayload>({
  name: 'edit_booking',
  offline: true,
  summarize: () => msg({ id: 'bookings.queued.edit', message: 'A booking edit' }),
});

export const deleteBookingCommand = defineClientCommand<DeleteBookingPayload>({
  name: 'delete_booking',
  offline: true,
  summarize: () => msg({ id: 'bookings.queued.delete', message: 'A deleted booking' }),
});

export const setBookingVisibilityCommand = defineClientCommand<{
  booking_id: string;
  visibility: 'crew' | 'personal';
}>({
  name: 'set_booking_visibility',
  offline: true,
  summarize: () => msg({ id: 'bookings.queued.visibility', message: 'Who sees a booking' }),
});

export const setFlightCrewVisibilityCommand = defineClientCommand<{
  booking_id: string;
  visible: boolean;
}>({
  name: 'set_flight_crew_visibility',
  offline: true,
  summarize: () => msg({ id: 'bookings.queued.flightVisibility', message: 'Who sees a flight' }),
});

export const reportLandedCommand = defineClientCommand<{ booking_id: string }>({
  name: 'report_landed',
  offline: true,
  summarize: () => msg({ id: 'bookings.queued.landed', message: 'Your landing' }),
});

export const resolveCandidateCommand = defineClientCommand<ResolveImportCandidatePayload>({
  name: 'resolve_import_candidate',
  offline: true,
  summarize: (payload) =>
    payload.action === 'add'
      ? msg({ id: 'bookings.queued.candidateAdd', message: 'A found booking, added' })
      : msg({ id: 'bookings.queued.candidateIgnore', message: 'A found booking, ignored' }),
});

export const importPasteCommand = defineClientCommand<ImportPastePayload>({
  name: 'import_paste',
  offline: false,
});

export const importScanCommand = defineClientCommand<ImportScanPayload>({
  name: 'import_scan',
  offline: false,
});

export const saveInsuranceCommand = defineClientCommand<{
  policy_id: string;
  trip_id?: string;
  provider: string;
  policy_no: string;
  assistance_phone?: string;
  doc_media_key?: string;
}>({
  name: 'save_insurance_policy',
  offline: false,
});

export const deleteInsuranceCommand = defineClientCommand<{ policy_id: string }>({
  name: 'delete_insurance_policy',
  offline: true,
  summarize: () => msg({ id: 'bookings.queued.insuranceDelete', message: 'A deleted policy' }),
});
