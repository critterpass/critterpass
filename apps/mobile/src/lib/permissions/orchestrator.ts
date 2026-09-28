/**
 * `requestWithPrimer(kind, trigger)`: the one way a feature asks for an OS permission. The primer
 * card or sheet comes first; the OS prompt fires only when the user accepts it (or flips a 3a-9
 * card toggle on, which *is* the primer). A declined primer stays quiet for the re-ask window per
 * trigger; once the OS says denied, only the Settings path is offered. Results land in the store,
 * which the mirror turns into `update_device_permissions`.
 */
import {
  decideAsk,
  isUsable,
  isUserInitiated,
  PERMISSION_COMPANIONS,
  type PermissionKind,
  type PermissionTrigger,
} from '@cp/domain';

import type { PermissionReport, PermissionStore } from './store';

export type RequestLevel = 'always' | 'provisional';

/** What the orchestrator needs from cp-permissions (the route layer wires the real module). */
export interface PermissionsPort {
  getStatus(kind: PermissionKind): Promise<PermissionReport>;
  request(kind: PermissionKind, level?: RequestLevel): Promise<PermissionReport>;
  openSettings(target: string): Promise<boolean>;
  settingsTargetFor(kind: PermissionKind): string;
}

export type PrimerMode = 'primer' | 'settings';

export interface PrimerRequest {
  readonly kind: PermissionKind;
  readonly trigger: PermissionTrigger;
  readonly mode: PrimerMode;
  readonly level?: RequestLevel;
}

export type PrimerAnswer = 'accept' | 'decline';
export type PrimerPresenter = (request: PrimerRequest) => Promise<PrimerAnswer>;

export type RequestOutcome =
  /** The feature's need is met. */
  | { readonly result: 'granted'; readonly report: PermissionReport }
  /** Usable but below the ask: provisional, limited, approximate, or WIU when Always was asked. */
  | { readonly result: 'partial'; readonly report: PermissionReport }
  /** The OS said no; `report.canAskAgain` false = only Settings can change it now. */
  | { readonly result: 'denied'; readonly report: PermissionReport }
  | { readonly result: 'declined' }
  | { readonly result: 'suppressed' }
  | { readonly result: 'settings'; readonly opened: boolean }
  | { readonly result: 'unavailable' };

export type PermissionAnalyticsEvent =
  | {
      readonly name: 'permission_primer_shown';
      readonly kind: PermissionKind;
      readonly trigger: PermissionTrigger;
      readonly settingsOnly: boolean;
    }
  | {
      readonly name: 'permission_result';
      readonly perm: string;
      readonly context: PermissionTrigger;
      readonly result: 'granted' | 'denied' | 'limited' | 'blocked';
    };

export interface OrchestratorOptions {
  readonly port: PermissionsPort;
  readonly store: PermissionStore;
  readonly presenter: () => PrimerPresenter | null;
  readonly now?: () => number;
  /** Server-configurable re-ask window. */
  readonly reaskWindowMs?: () => number | undefined;
  readonly track?: (event: PermissionAnalyticsEvent) => void;
}

/** Whether `report` meets what the feature asked for. */
export function isSatisfied(
  kind: PermissionKind,
  report: PermissionReport,
  level?: RequestLevel,
): boolean {
  if (!report.available || !isUsable(report.status)) return false;
  if (kind === 'location') {
    return level === 'always' ? report.level === 'always' : report.level !== 'none';
  }
  if (kind === 'calendar') return report.status === 'granted';
  if (kind === 'notifications' && level !== 'provisional') {
    return report.status === 'granted' || report.status === 'provisional';
  }
  return true;
}

function isFull(kind: PermissionKind, report: PermissionReport): boolean {
  if (report.status !== 'granted') return false;
  return kind !== 'location' || report.precise !== false;
}

function analyticsPerm(kind: PermissionKind, level: RequestLevel | undefined): string {
  if (kind === 'location' && level === 'always') return 'location_always';
  if (kind === 'photos_add') return 'photos';
  return kind;
}

function analyticsResult(outcome: RequestOutcome): 'granted' | 'denied' | 'limited' | 'blocked' {
  if (outcome.result === 'granted') return 'granted';
  if (outcome.result === 'partial') return 'limited';
  if (outcome.result === 'denied') return outcome.report.canAskAgain ? 'denied' : 'blocked';
  return 'blocked';
}

export function createOrchestrator(options: OrchestratorOptions) {
  const now = options.now ?? Date.now;
  const { port, store } = options;

  function classify(kind: PermissionKind, report: PermissionReport, level?: RequestLevel) {
    if (isSatisfied(kind, report, level)) {
      return isFull(kind, report) || level === 'provisional'
        ? ({ result: 'granted', report } as const)
        : ({ result: 'partial', report } as const);
    }
    return isUsable(report.status)
      ? ({ result: 'partial', report } as const)
      : ({ result: 'denied', report } as const);
  }

  async function prompt(
    kind: PermissionKind,
    trigger: PermissionTrigger,
    level: RequestLevel | undefined,
  ): Promise<RequestOutcome> {
    const report = await port.request(kind, level);
    store.setReport(report);
    const companion = PERMISSION_COMPANIONS[kind];
    if (companion !== undefined && isUsable(report.status)) {
      store.setReport(await port.request(companion));
    }
    const outcome = classify(kind, report, level);
    if (outcome.result !== 'denied') store.clearDeclined(trigger);
    options.track?.({
      name: 'permission_result',
      perm: analyticsPerm(kind, level),
      context: trigger,
      result: analyticsResult(outcome),
    });
    return outcome;
  }

  async function openSettingsFor(kind: PermissionKind): Promise<boolean> {
    return port.openSettings(port.settingsTargetFor(kind));
  }

  /**
   * Primer (or the Settings-only sheet) first, then the OS prompt. `primed: true` = the caller's
   * own UI already was the primer (a 3a-9 card toggled on), so no sheet is shown.
   */
  async function requestWithPrimer(
    kind: PermissionKind,
    trigger: PermissionTrigger,
    opts: { readonly level?: RequestLevel; readonly primed?: boolean } = {},
  ): Promise<RequestOutcome> {
    const report = await port.getStatus(kind);
    store.setReport(report);
    const satisfied = isSatisfied(kind, report, opts.level);
    const windowMs = options.reaskWindowMs?.();
    const decision = decideAsk({
      status: report.status,
      canAskAgain: report.canAskAgain,
      satisfied,
      lastDeclinedAt: store.lastDeclinedAt(trigger),
      now: now(),
      userInitiated: opts.primed === true || isUserInitiated(trigger),
      ...(windowMs !== undefined ? { windowMs } : {}),
    });
    if (!report.available || decision === 'unavailable') return { result: 'unavailable' };
    if (decision === 'satisfied') return classify(kind, report, opts.level);
    if (decision === 'suppressed') return { result: 'suppressed' };

    const mode: PrimerMode = decision === 'settings_only' ? 'settings' : 'primer';
    if (opts.primed === true) {
      if (mode === 'settings') return { result: 'settings', opened: false };
      return prompt(kind, trigger, opts.level);
    }
    const presenter = options.presenter();
    if (presenter === null) return { result: 'suppressed' };
    options.track?.({
      name: 'permission_primer_shown',
      kind,
      trigger,
      settingsOnly: mode === 'settings',
    });
    const answer = await presenter({
      kind,
      trigger,
      mode,
      ...(opts.level ? { level: opts.level } : {}),
    });
    if (answer !== 'accept') {
      store.markDeclined(trigger, now());
      return { result: 'declined' };
    }
    if (mode === 'settings') return { result: 'settings', opened: await openSettingsFor(kind) };
    return prompt(kind, trigger, opts.level);
  }

  return { requestWithPrimer, openSettingsFor, isSatisfied };
}

export type PermissionOrchestrator = ReturnType<typeof createOrchestrator>;
