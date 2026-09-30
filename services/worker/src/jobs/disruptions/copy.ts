/**
 * The flight disruption's words: the rows as the planner classified them go to the guide (route
 * `disruption.plan_b`) with their facts and template labels; anything short of a clean, grounded
 * reply keeps the templates. No model configured → templates.
 */
import {
  createGateway,
  personaIdSchema,
  writeDisruptionCopy,
  type AssertRouteOn,
  type CopyInput,
  type CopyResult,
  type Gateway,
  type Telemetry,
} from '@cp/ai';
import type { DisruptionAction } from '@cp/domain';
import type { FlightImpact } from '@cp/planner';

import type { FlightFacts } from './flight-inputs';

export type DisruptionWriter = (
  facts: FlightFacts,
  impact: FlightImpact,
  rows: readonly DisruptionAction[],
) => Promise<CopyResult>;

export interface GatewayEnv {
  readonly ANTHROPIC_API_KEY?: string | undefined;
  readonly ANTHROPIC_BASE_URL?: string | undefined;
}

export function gatewayFrom(
  env: GatewayEnv,
  assertRouteOn: AssertRouteOn,
  telemetry: Telemetry | undefined,
): Pick<Gateway, 'callModel'> | undefined {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) return undefined;
  return createGateway({
    apiKey,
    ...(env.ANTHROPIC_BASE_URL === undefined ? {} : { baseURL: env.ANTHROPIC_BASE_URL }),
    ...(telemetry === undefined ? {} : { telemetry }),
    assertRouteOn,
  });
}

export function headlineFor(facts: FlightFacts, impact: FlightImpact): string {
  const flight = String(impact.facts['flight']);
  switch (impact.cause) {
    case 'cancelled':
      return `${flight} is cancelled`;
    case 'missed_connection':
      return 'Connection missed';
    case 'diverted':
      return `${flight} diverted to ${facts.input.change.arrivalAirport}`;
    case 'delay':
      return `${flight} lands at ${String(impact.facts['new_arrival'])}`;
  }
}

function detailFor(impact: FlightImpact): string {
  const count = impact.travellerIds.length;
  const who = count === 1 ? 'You' : `${String(count)} of you`;
  if (impact.newArrival === null) {
    return `${who} will not land as planned. Rebook with the airline and I will fit the plan around it.`;
  }
  return `${who} land at ${String(impact.facts['new_arrival'])}. I moved what I could and need a yes on the rest.`;
}

export function copyInputFor(
  facts: FlightFacts,
  impact: FlightImpact,
  rows: readonly DisruptionAction[],
): CopyInput {
  return {
    facts: impact.facts,
    headlineTemplate: headlineFor(facts, impact),
    detailTemplate: detailFor(impact),
    items: rows.map((row) => ({
      id: row.id,
      kind: `${row.kind}:${row.state}`,
      facts: row.facts,
      template: row.label,
    })),
  };
}

export function disruptionWriter(
  gateway: Pick<Gateway, 'callModel'> | undefined,
): DisruptionWriter {
  return (facts, impact, rows) => {
    const guide = personaIdSchema.safeParse(facts.guide);
    return writeDisruptionCopy(
      gateway,
      guide.success ? guide.data : 'tokek',
      copyInputFor(facts, impact, rows),
      { tripId: facts.tripId },
    );
  };
}
