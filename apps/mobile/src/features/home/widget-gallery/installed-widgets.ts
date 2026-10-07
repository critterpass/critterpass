/**
 * The widgets placed on this phone as `sync_installed_widgets` names them. Each widget in the
 * extension declares its WidgetKit kind (`CPCountdownWidget`, ...); this maps them to the domain's
 * widget kinds and drops anything it does not know (an older or newer extension's widget).
 * Android's Glance widgets already report the domain's kinds, with the `android` family.
 */
/* eslint-disable lingui/no-unlocalized-strings -- WidgetKit kind strings, never copy. */
import {
  installedWidgetSchema,
  type SyncInstalledWidgetsPayload,
  type WidgetKind,
} from '@cp/domain';

/** WidgetKit kind (targets/widgets/Widgets/*Widget.swift `kind`) → domain widget kind. */
export const WIDGET_KIND_BY_NATIVE: Readonly<Record<string, WidgetKind>> = {
  CPCountdownWidget: 'countdown',
  CPVoteWidget: 'vote',
  CPCritterdexWidget: 'critterdex',
  CPTodayWidget: 'today',
  CPBalancesWidget: 'balances',
  CPCrewWidget: 'crew',
  CPNextFlightWidget: 'next_flight',
  CPNextLeaveByWidget: 'next_leave_by',
  CPStandByWidget: 'standby_clock',
};

/** A widget as WidgetKit reports it (cp-widgets `installed()`). */
export interface PlacedWidget {
  readonly kind: string;
  readonly family: string;
}

export function installedWidgetsPayload(
  placed: readonly PlacedWidget[],
): SyncInstalledWidgetsPayload {
  const seen = new Set<string>();
  const widgets: SyncInstalledWidgetsPayload['widgets'] = [];
  for (const widget of placed) {
    const kind = WIDGET_KIND_BY_NATIVE[widget.kind] ?? widget.kind;
    const parsed = installedWidgetSchema.safeParse({ kind, family: widget.family });
    if (!parsed.success) continue;
    const key = `${kind}:${widget.family}`;
    if (seen.has(key)) continue;
    seen.add(key);
    widgets.push(parsed.data);
  }
  return { widgets: widgets.slice(0, 64) };
}
