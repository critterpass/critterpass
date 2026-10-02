/**
 * The running-late screen (3k-9) worked out from the synced `disruptions` row: how late, the ETA
 * and whether it is still live, the options the planner offered (with what each would cost and
 * whether whoever runs the place has said yes), the pick, and whether the signed-in member is in
 * the late party (they choose) or waiting for it (they are told). Pure.
 */
import {
  disruptionActionsSchema,
  disruptionAffectedSchema,
  lateOptionsSchema,
  type LateOption,
  type LateOptionKind,
} from '@cp/domain';

export interface LateRowData {
  readonly id: string;
  readonly trip_id: string;
  readonly kind: string;
  readonly status: string;
  readonly title: string;
  readonly summary: string;
  readonly affected: string | null;
  readonly facts: string | null;
  readonly options: string | null;
  readonly actions: string | null;
  readonly chosen_option_id: string | null;
  readonly i18n: string | null;
}

/** Whoever runs the place: asked and answered yes, asked and waiting, or not asked at all. */
export type VendorStatus = 'agreed' | 'asked' | 'declined' | 'not_asked';

export interface LateModel {
  readonly lateMin: number;
  readonly start: string;
  readonly eta: string;
  readonly title: string;
  /** The ETA's checks stopped: it is the last one known, not live. */
  readonly stale: boolean;
  readonly open: boolean;
  readonly options: readonly LateOption[];
  readonly recommended: LateOptionKind | null;
  readonly chosen: LateOptionKind | null;
  readonly vendor: { readonly name: string; readonly status: VendorStatus } | null;
  readonly partyIds: readonly string[];
  readonly waitingIds: readonly string[];
  /** The signed-in member is late: they pick. Anyone else on the item is waiting: they are told. */
  readonly role: 'late' | 'waiting' | 'other';
}

function parse<T>(text: string | null, read: (value: unknown) => T, fallback: T): T {
  if (text === null || text === '') return fallback;
  try {
    return read(JSON.parse(text) as unknown);
  } catch {
    return fallback;
  }
}

/* eslint-disable lingui/no-unlocalized-strings -- option ids and states, never copy. */
const KINDS: ReadonlySet<string> = new Set(['push', 'walk', 'skip', 'car']);
const ASKED: ReadonlySet<string> = new Set(['sent', 'approved']);
const REFUSED: ReadonlySet<string> = new Set(['declined', 'no_answer']);
const NOT_ASKED: VendorStatus = 'not_asked';
const AGREED: VendorStatus = 'agreed';
const CONFIRMED = 'confirmed';
const DECLINED: VendorStatus = 'declined';
const ASKED_STATUS: VendorStatus = 'asked';
/* eslint-enable lingui/no-unlocalized-strings */

export function lateModel(row: LateRowData, me: string | null): LateModel {
  const facts = parse(
    row.facts,
    (value) => (typeof value === 'object' && value !== null ? value : {}),
    {},
  ) as Record<string, string | number>;
  const affected = parse(row.affected, (value) => disruptionAffectedSchema.parse(value), {
    traveller_ids: [],
    item_stable_ids: [],
    unaffected_ids: [],
  });
  const options = parse(row.options, (value) => lateOptionsSchema.parse(value), []).filter(
    (option) => option.offered,
  );
  const actions = parse(row.actions, (value) => disruptionActionsSchema.parse(value), []);
  const message = actions.find((action) => action.kind === 'contact_vendor');
  const vendorName =
    options.find((option) => option.vendor_name !== null)?.vendor_name ??
    (typeof message?.facts['vendor'] === 'string' ? message.facts['vendor'] : null);
  let status: VendorStatus = NOT_ASKED;
  if (message?.state === CONFIRMED) status = AGREED;
  else if (message !== undefined && REFUSED.has(message.state)) status = DECLINED;
  else if (message !== undefined && ASKED.has(message.state)) status = ASKED_STATUS;
  const chosen =
    row.chosen_option_id !== null && KINDS.has(row.chosen_option_id)
      ? (row.chosen_option_id as LateOptionKind)
      : null;
  const role =
    me !== null && affected.traveller_ids.includes(me)
      ? 'late'
      : me !== null && affected.unaffected_ids.includes(me)
        ? 'waiting'
        : 'other';
  return {
    lateMin: Number(facts['late_min'] ?? 0),
    start: String(facts['start'] ?? ''),
    eta: String(facts['eta'] ?? ''),
    title: String(facts['title'] ?? row.title),
    stale: facts['stale'] === 'yes',
    open: row.status === 'open',
    options,
    recommended: options.find((option) => option.recommended)?.id ?? null,
    chosen,
    vendor: vendorName === null ? null : { name: vendorName, status },
    partyIds: affected.traveller_ids,
    waitingIds: affected.unaffected_ids,
    role,
  };
}

/** The option the sheet starts on: the pick, else the planner's recommendation, else the first. */
export function initialSelection(model: LateModel): LateOptionKind | null {
  return model.chosen ?? model.recommended ?? model.options[0]?.id ?? null;
}
