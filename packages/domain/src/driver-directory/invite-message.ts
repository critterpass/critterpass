/**
 * The invite the member sends the driver from WhatsApp (6g-2). It goes to the driver, not to the
 * member, so it is written in English with an optional Bahasa Indonesia copy below, whatever
 * language the app runs in. The member edits it before sending.
 */

export interface DriverInviteMessageInput {
  readonly driverName: string;
  readonly senderName: string;
  readonly crewSize: number;
  /** Places he drove the crew to, already joined (`Jatiluwih and Uluwatu`). */
  readonly places: string;
  /** The days, already formatted (`14 and 18 Oct`). */
  readonly dates: string;
  readonly url: string;
}

const EN_GROUP = [
  '',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
];
const ID_GROUP = [
  '',
  'satu',
  'dua',
  'tiga',
  'empat',
  'lima',
  'enam',
  'tujuh',
  'delapan',
  'sembilan',
  'sepuluh',
];

function context(places: string, dates: string): string {
  if (places !== '' && dates !== '') return ` (${places}, ${dates})`;
  if (places !== '' || dates !== '') return ` (${places}${dates})`;
  return '';
}

export function driverInviteMessageEn(input: DriverInviteMessageInput): string {
  const size = EN_GROUP[input.crewSize] ?? String(input.crewSize);
  return [
    `Hi ${input.driverName}, it's ${input.senderName} from the group of ${size}${context(input.places, input.dates)}. Thank you again!`,
    `Our trip app lists drivers travellers loved, so other groups can find them. It's free and you choose what's shown. If you'd like that: ${input.url}`,
    'If not, no problem, just ignore this.',
  ].join('\n');
}

export function driverInviteMessageId(input: DriverInviteMessageInput): string {
  const size = ID_GROUP[input.crewSize] ?? String(input.crewSize);
  return [
    `Halo ${input.driverName}, ini ${input.senderName} dari rombongan ${size} orang${context(input.places, input.dates)}. Terima kasih lagi!`,
    `Aplikasi perjalanan kami mencantumkan sopir yang disukai wisatawan, supaya rombongan lain bisa menemukan Anda. Gratis, dan Anda yang memilih apa yang ditampilkan. Kalau berminat: ${input.url}`,
    'Kalau tidak, tidak apa-apa, abaikan saja pesan ini.',
  ].join('\n');
}

export function driverInviteMessage(input: DriverInviteMessageInput, withBahasa: boolean): string {
  const en = driverInviteMessageEn(input);
  return withBahasa ? `${en}\n\n${driverInviteMessageId(input)}` : en;
}
