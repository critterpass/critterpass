/** The words for the driver card's verdicts and tags, shared by the rate card and the directory. */
import type { DriverTag, DriverVerdict } from '@cp/domain';
import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';

export const TAG_LABELS: Readonly<Record<DriverTag, MessageDescriptor>> = {
  on_time: msg({ id: 'drivers.tag.onTime', message: 'On time' }),
  safe_driver: msg({ id: 'drivers.tag.safeDriver', message: 'Safe driver' }),
  knew_the_spots: msg({ id: 'drivers.tag.knewTheSpots', message: 'Knew the spots' }),
  good_english: msg({ id: 'drivers.tag.goodEnglish', message: 'Good English' }),
  fair_price: msg({ id: 'drivers.tag.fairPrice', message: 'Fair price' }),
  patient: msg({ id: 'drivers.tag.patient', message: 'Patient' }),
  great_photos: msg({ id: 'drivers.tag.greatPhotos', message: 'Great photos' }),
  new_car: msg({ id: 'drivers.tag.newCar', message: 'New car' }),
};

export const VERDICT_LABELS: Readonly<Record<DriverVerdict, MessageDescriptor>> = {
  loved: msg({ id: 'drivers.verdict.loved', message: 'Loved it' }),
  fine: msg({ id: 'drivers.verdict.fine', message: 'Fine' }),
  not_again: msg({ id: 'drivers.verdict.notAgain', message: 'Not again' }),
};

export function isDriverTag(tag: string): tag is DriverTag {
  return tag in TAG_LABELS;
}
