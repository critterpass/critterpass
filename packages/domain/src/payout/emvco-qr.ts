/**
 * EMVCo merchant-presented QR payloads for the four national schemes a payer can scan straight
 * into their bank app: PayNow (Singapore), PromptPay (Thailand), VietQR (Vietnam, NAPAS) and
 * DuitNow (Malaysia). Each data object is ID (2) + length (2) + value, objects in ascending ID
 * order, and the payload ends with `6304` + CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) over
 * everything before it, the `6304` included. Payloads are built only from what the payee entered;
 * the bank app shows the payee's registered name before anyone sends money.
 */

/** CRC-16/CCITT-FALSE as four upper-case hex digits. */
export function crc16(text: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(text)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** One data object; values are ASCII and at most 99 characters. */
export function tlv(id: string, value: string): string {
  if (!/^\d{2}$/u.test(id)) throw new Error(`EMVCo id must be two digits: ${id}`);
  if (value.length > 99) throw new Error(`EMVCo value for ${id} is longer than 99`);
  return `${id}${value.length.toString().padStart(2, '0')}${value}`;
}

/** Appends `6304` and the CRC over the whole payload. */
export function withCrc(body: string): string {
  const signed = `${body}6304`;
  return `${signed}${crc16(signed)}`;
}

/** Whether a payload's trailing CRC matches its content. */
export function hasValidCrc(payload: string): boolean {
  return payload.length > 8 && withCrc(payload.slice(0, -8)) === payload;
}

/** Printable ASCII only (banks reject anything else): accents dropped, trimmed to `max`. */
export function asciiField(text: string, max: number): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .replace(/đ/gu, 'd')
    .replace(/Đ/gu, 'D')
    .replace(/[^\x20-\x7e]/gu, '')
    .trim()
    .slice(0, max);
}

/** Minor units as the decimal major-unit string EMVCo tag 54 carries ("0.99", "120000"). */
export function emvAmount(amountMinor: bigint, exponent: number): string {
  if (amountMinor <= 0n) throw new Error('an EMVCo amount is positive');
  if (exponent === 0) return amountMinor.toString();
  const digits = amountMinor.toString().padStart(exponent + 1, '0');
  return `${digits.slice(0, -exponent)}.${digits.slice(-exponent)}`;
}

export interface QrAmount {
  readonly amountMinor: bigint;
  /** The currency's ISO 4217 exponent (SGD/THB/MYR 2, VND 0). */
  readonly exponent: number;
}

function header(amount: QrAmount | undefined): string {
  // Point of initiation: 11 = reusable (no amount), 12 = this one payment (amount fixed).
  return tlv('00', '01') + tlv('01', amount === undefined ? '11' : '12');
}

function tail(fields: {
  readonly mcc?: string;
  readonly currency: string;
  readonly amount?: QrAmount | undefined;
  readonly country: string;
  readonly name?: string | undefined;
  readonly city?: string | undefined;
  readonly additional?: string | undefined;
}): string {
  return [
    fields.mcc === undefined ? '' : tlv('52', fields.mcc),
    tlv('53', fields.currency),
    fields.amount === undefined
      ? ''
      : tlv('54', emvAmount(fields.amount.amountMinor, fields.amount.exponent)),
    tlv('58', fields.country),
    fields.name === undefined || fields.name === '' ? '' : tlv('59', asciiField(fields.name, 25)),
    fields.city === undefined ? '' : tlv('60', asciiField(fields.city, 15)),
    fields.additional === undefined || fields.additional === '' ? '' : tlv('62', fields.additional),
  ].join('');
}

export interface PayNowQrInput {
  readonly proxyType: 'mobile' | 'uen';
  /** `+6591234567` for a mobile number, the UEN for a business. */
  readonly proxy: string;
  readonly name: string;
  readonly amount?: QrAmount;
  /** Whether the payer may change the amount (default: only when none is set). */
  readonly editable?: boolean;
  /** `YYYYMMDD` after which the QR stops working. */
  readonly expiry?: string;
  readonly reference?: string;
}

export function payNowQr(input: PayNowQrInput): string {
  const editable = input.editable ?? input.amount === undefined;
  const account =
    tlv('00', 'SG.PAYNOW') +
    tlv('01', input.proxyType === 'mobile' ? '0' : '2') +
    tlv('02', input.proxy) +
    tlv('03', editable ? '1' : '0') +
    (input.expiry === undefined ? '' : tlv('04', input.expiry));
  const reference =
    input.reference === undefined ? undefined : tlv('01', asciiField(input.reference, 25));
  return withCrc(
    header(input.amount) +
      tlv('26', account) +
      tail({
        mcc: '0000',
        currency: '702',
        amount: input.amount,
        country: 'SG',
        name: input.name,
        city: 'Singapore',
        additional: reference,
      }),
  );
}

export interface PromptPayQrInput {
  readonly proxyType: 'mobile' | 'national_id' | 'ewallet';
  /** A Thai mobile number (`0812345678` or `+66812345678`), a 13-digit ID or an e-wallet id. */
  readonly proxy: string;
  readonly amount?: QrAmount;
}

/** PromptPay's mobile proxy: `0066` + the number without its trunk zero, 13 digits in all. */
export function promptPayMobile(phone: string): string {
  const digits = phone.replace(/\D/gu, '');
  const national = digits.startsWith('66') ? digits.slice(2) : digits.replace(/^0/u, '');
  return `0066${national}`.padStart(13, '0');
}

export function promptPayQr(input: PromptPayQrInput): string {
  const proxy =
    input.proxyType === 'mobile' ? promptPayMobile(input.proxy) : input.proxy.replace(/\D/gu, '');
  const proxyTag = { mobile: '01', national_id: '02', ewallet: '03' }[input.proxyType];
  const account = tlv('00', 'A000000677010111') + tlv(proxyTag, proxy);
  return withCrc(
    header(input.amount) +
      tlv('29', account) +
      tail({ currency: '764', amount: input.amount, country: 'TH' }),
  );
}

export interface VietQrInput {
  /** The bank's six-digit NAPAS BIN (e.g. 970415). */
  readonly bankBin: string;
  readonly accountNumber: string;
  readonly amount?: QrAmount;
  /** The transfer message ("purpose of transaction"). */
  readonly note?: string;
}

export function vietQr(input: VietQrInput): string {
  const beneficiary = tlv('00', input.bankBin) + tlv('01', input.accountNumber);
  const account = tlv('00', 'A000000727') + tlv('01', beneficiary) + tlv('02', 'QRIBFTTA');
  const note = input.note === undefined ? undefined : tlv('08', asciiField(input.note, 50));
  return withCrc(
    header(input.amount) +
      tlv('38', account) +
      tail({ currency: '704', amount: input.amount, country: 'VN', additional: note }),
  );
}

export interface DuitNowQrInput {
  /** The receiving institution's DuitNow acquirer id. */
  readonly acquirerId: string;
  readonly accountNumber: string;
  readonly name: string;
  readonly city?: string;
  readonly amount?: QrAmount;
}

export function duitNowQr(input: DuitNowQrInput): string {
  const account =
    tlv('00', 'A0000006150001') + tlv('01', input.acquirerId) + tlv('02', input.accountNumber);
  return withCrc(
    header(input.amount) +
      tlv('26', account) +
      tail({
        mcc: '0000',
        currency: '458',
        amount: input.amount,
        country: 'MY',
        name: input.name,
        city: input.city ?? 'Kuala Lumpur',
      }),
  );
}
