import {
  setPlanningRedesignOverride,
  usePlanningRedesignSource,
  type PlanningSwitchSource,
} from '@/lib/navigation/planning-switch';
import { Stack, Text } from '@/ui';
import { ListCard } from '@/ui/cards/ListCard';
import { SecondaryText } from '@/ui/cards/SecondaryText';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

const SOURCE_LABELS: Record<PlanningSwitchSource, string> = {
  override: 'overridden on this phone',
  config: 'from the synced config',
  default: 'default: no config has reached this phone',
};

/**
 * `planning.redesign` for this phone only: the value in force and where it comes from, with rows
 * that turn the section 7 screens on or off here, or go back to the synced config. Device runs
 * turn it on through `e2e/_shared/planning-redesign-on.yaml`; the shared config is never touched.
 */
export function PlanningRedesignSection() {
  const { redesign, source } = usePlanningRedesignSource();
  const state = redesign ? 'on' : 'off';
  return (
    <Stack gap="8">
      <Text testID={`dev-planning-redesign-state-${state}`}>
        {`Planning redesign is ${state.toUpperCase()}`}
      </Text>
      <SecondaryText variant="caption" testID={`dev-planning-redesign-source-${source}`}>
        {SOURCE_LABELS[source]}
      </SecondaryText>
      <ListCard
        testID="dev-planning-redesign-on"
        title="Turn the planning redesign on here"
        chevron={false}
        onPress={() => setPlanningRedesignOverride(true)}
      />
      <ListCard
        testID="dev-planning-redesign-off"
        title="Turn the planning redesign off here"
        chevron={false}
        onPress={() => setPlanningRedesignOverride(false)}
      />
      <ListCard
        testID="dev-planning-redesign-follow"
        title="Follow the synced config"
        chevron={false}
        onPress={() => setPlanningRedesignOverride(null)}
      />
    </Stack>
  );
}
