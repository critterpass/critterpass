/**
 * IATA Bar Coded Boarding Pass decoder (Resolution 792, format "M"): the fixed mandatory items, one
 * block per leg, and the conditional items each leg's field-size markers delimit (the unique block
 * once, on the first leg; the repeated block on every leg), then the optional security data. Sizes
 * are hexadecimal and trusted only when they fit the string; anything else is a `BcbpError`.
 * Julian dates become calendar dates relative to the day the pass was read.
 */
export class BcbpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BcbpError';
  }
}

export interface BcbpLeg {
  readonly pnr: string;
  readonly from: string;
  readonly to: string;
  readonly carrier: string;
  /** Without leading zeros, with its suffix letter: "0834 " → "834". */
  readonly flightNumber: string;
  /** Day of the year of the flight (1–366). */
  readonly julianDate: number;
  readonly compartment: string;
  /** Normalised: "001A" → "1A"; empty for no seat ("INF", "GATE" kept as printed). */
  readonly seat: string;
  readonly checkInSequence: string;
  readonly passengerStatus: string;
  readonly airlineNumericCode?: string;
  readonly documentSerial?: string;
  readonly selectee?: string;
  readonly marketingCarrier?: string;
  readonly frequentFlyerAirline?: string;
  readonly frequentFlyerNumber?: string;
  readonly freeBaggage?: string;
  readonly fastTrack?: string;
  /** The rest of the leg's data, for the airline's own use. */
  readonly airlineData?: string;
}

export interface BcbpPass {
  readonly passengerName: string;
  readonly electronicTicket: boolean;
  readonly legs: readonly BcbpLeg[];
  readonly version?: string;
  readonly passengerDescription?: string;
  readonly checkInSource?: string;
  readonly boardingPassSource?: string;
  /** Last digit of the year and day of the year the pass was issued ("5321"). */
  readonly dateOfIssue?: string;
  readonly documentType?: string;
  readonly issuer?: string;
  readonly baggageTags: readonly string[];
  readonly securityData?: { readonly type: string; readonly data: string };
}

class Cursor {
  constructor(
    readonly text: string,
    public at = 0,
  ) {}

  take(length: number, what: string): string {
    if (this.at + length > this.text.length) throw new BcbpError(`${what}: the pass ends early`);
    const value = this.text.slice(this.at, this.at + length);
    this.at += length;
    return value;
  }

  hex(what: string): number {
    const raw = this.take(2, what);
    if (!/^[0-9A-Fa-f]{2}$/u.test(raw)) throw new BcbpError(`${what}: "${raw}" is not a size`);
    return Number.parseInt(raw, 16);
  }

  /** Reads `size` characters as their own cursor (a conditional block). */
  block(size: number, what: string): Cursor {
    return new Cursor(this.take(size, what));
  }

  get done(): boolean {
    return this.at >= this.text.length;
  }

  /** Up to `length` characters, fewer when the block is shorter (conditional items are optional). */
  optional(length: number): string | undefined {
    if (this.done) return undefined;
    const value = this.text.slice(this.at, this.at + length);
    this.at += value.length;
    return value;
  }
}

const trimmed = (value: string | undefined) => {
  const out = value?.trim();
  return out === undefined || out === '' ? undefined : out;
};

function seatOf(raw: string): string {
  const match = /^0*(\d{1,3})([A-Z])$/u.exec(raw.trim());
  return match === null ? raw.trim() : `${match[1]}${match[2]}`;
}

function flightNumberOf(raw: string): string {
  const match = /^0*(\d{1,4})([A-Z]?)\s*$/u.exec(raw);
  if (match === null) throw new BcbpError(`flight number "${raw}" is not a flight number`);
  return `${match[1]}${match[2]}`;
}

function mandatoryLeg(cursor: Cursor): Omit<BcbpLeg, 'airlineData'> & { size: number } {
  const pnr = cursor.take(7, 'booking reference').trim();
  const from = cursor.take(3, 'from airport');
  const to = cursor.take(3, 'to airport');
  const carrier = cursor.take(3, 'carrier').trim();
  const flightNumber = flightNumberOf(cursor.take(5, 'flight number'));
  const julian = cursor.take(3, 'date of flight');
  const compartment = cursor.take(1, 'compartment');
  const seat = seatOf(cursor.take(4, 'seat'));
  const checkInSequence = cursor
    .take(5, 'check-in sequence')
    .trim()
    .replace(/^0+(?=\d)/u, '');
  const passengerStatus = cursor.take(1, 'passenger status');
  const size = cursor.hex('variable field size');
  if (!/^[A-Z]{3}$/u.test(from) || !/^[A-Z]{3}$/u.test(to)) {
    throw new BcbpError('airport codes are not IATA codes');
  }
  if (!/^[A-Z0-9]{2,3}$/u.test(carrier)) throw new BcbpError('carrier is not an airline code');
  const julianDate = Number(julian);
  if (!/^\d{3}$/u.test(julian) || julianDate < 1 || julianDate > 366) {
    throw new BcbpError('date of flight is not a day of the year');
  }
  return {
    pnr,
    from,
    to,
    carrier,
    flightNumber,
    julianDate,
    compartment,
    seat,
    checkInSequence,
    passengerStatus,
    size,
  };
}

function repeatedBlock(cursor: Cursor): Partial<BcbpLeg> {
  const size = cursor.hex('repeated field size');
  const block = cursor.block(size, 'repeated conditional items');
  const fields = {
    airlineNumericCode: trimmed(block.optional(3)),
    documentSerial: trimmed(block.optional(10)),
    selectee: trimmed(block.optional(1)),
    internationalDocs: trimmed(block.optional(1)),
    marketingCarrier: trimmed(block.optional(3)),
    frequentFlyerAirline: trimmed(block.optional(3)),
    frequentFlyerNumber: trimmed(block.optional(16)),
    idAd: trimmed(block.optional(1)),
    freeBaggage: trimmed(block.optional(3)),
    fastTrack: trimmed(block.optional(1)),
  };
  const { internationalDocs: _docs, idAd: _idAd, ...kept } = fields;
  return Object.fromEntries(Object.entries(kept).filter(([, value]) => value !== undefined));
}

export function decodeBcbp(raw: string): BcbpPass {
  const text = raw.replace(/\r?\n$/u, '');
  const cursor = new Cursor(text);
  if (cursor.take(1, 'format code') !== 'M') throw new BcbpError('only format M passes are read');
  const legCount = Number(cursor.take(1, 'number of legs'));
  if (!Number.isInteger(legCount) || legCount < 1 || legCount > 4) {
    throw new BcbpError('number of legs must be 1 to 4');
  }
  const passengerName = cursor.take(20, 'passenger name').trim();
  const electronicTicket = cursor.take(1, 'electronic ticket indicator') === 'E';
  const legs: BcbpLeg[] = [];
  let unique: Partial<BcbpPass> & { baggageTags: string[] } = { baggageTags: [] };
  for (let index = 0; index < legCount; index += 1) {
    const { size, ...leg } = mandatoryLeg(cursor);
    const variable = cursor.block(size, 'conditional items');
    let extra: Partial<BcbpLeg> = {};
    if (!variable.done) {
      if (index === 0 && variable.text.startsWith('>')) {
        variable.take(1, 'version marker');
        const version = variable.take(1, 'version number');
        const uniqueBlock = variable.block(variable.hex('unique field size'), 'unique items');
        const described = {
          passengerDescription: trimmed(uniqueBlock.optional(1)),
          checkInSource: trimmed(uniqueBlock.optional(1)),
          boardingPassSource: trimmed(uniqueBlock.optional(1)),
          dateOfIssue: trimmed(uniqueBlock.optional(4)),
          documentType: trimmed(uniqueBlock.optional(1)),
          issuer: trimmed(uniqueBlock.optional(3)),
        };
        const tags = [uniqueBlock.optional(13), uniqueBlock.optional(13), uniqueBlock.optional(13)];
        unique = {
          version,
          ...Object.fromEntries(
            Object.entries(described).filter(([, value]) => value !== undefined),
          ),
          baggageTags: tags.map(trimmed).filter((tag): tag is string => tag !== undefined),
        };
      }
      if (!variable.done) extra = repeatedBlock(variable);
      const airlineData = trimmed(variable.optional(variable.text.length));
      if (airlineData !== undefined) extra = { ...extra, airlineData };
    }
    legs.push({ ...leg, ...extra });
  }
  let securityData: BcbpPass['securityData'];
  if (!cursor.done && cursor.text[cursor.at] === '^') {
    cursor.take(1, 'security marker');
    const type = cursor.take(1, 'security type');
    const data = cursor.take(cursor.hex('security size'), 'security data');
    securityData = { type, data };
  }
  return {
    passengerName,
    electronicTicket,
    legs,
    ...unique,
    ...(securityData ? { securityData } : {}),
  };
}

/**
 * The calendar date of a leg: the day of the year in whichever year puts it closest after the day
 * the pass was read (a pass read in late December for a flight on day 3 flies next January).
 */
export function flightDate(julianDate: number, readOn: Date): string {
  const candidates = [-1, 0, 1].map((offset) => {
    const year = readOn.getUTCFullYear() + offset;
    return new Date(Date.UTC(year, 0, julianDate));
  });
  const earliest = readOn.getTime() - 30 * 86_400_000;
  const best =
    candidates.find((date) => date.getTime() >= earliest) ?? candidates[candidates.length - 1];
  return (best ?? new Date(readOn)).toISOString().slice(0, 10);
}
