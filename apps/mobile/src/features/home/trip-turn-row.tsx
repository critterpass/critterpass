/**
 * The strip under the next-up card, with its state line and one button: whose turn it is on the
 * trip (the guide is drafting, your draft is ready, send the plan, a plan waits for your answer,
 * replies are in, locked) and the step that is the viewer's to take. Undesigned; logged in
 * docs/undesigned-states.md. The same reading drives the hub's main button, so the two agree.
 */
import { upper } from '@cp/i18n';
import { router } from 'expo-router';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { Card } from '@/ui/cards/Card';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';

import { useTripTurnView } from './slots';

export interface TripTurnRowProps {
  readonly tripId: string;
  /** The trip's guide, by name ("Chà Vá"). */
  readonly guide: string;
}

/** States that have nothing to say on Home: the vote has its own board. */
const QUIET: ReadonlySet<string> = new Set(['none', 'vote']);

export function TripTurnRow({ tripId, guide }: TripTurnRowProps) {
  const locale = useLocale();
  const view = useTripTurnView(tripId, { locale, guide });
  if (view === null || QUIET.has(view.kind)) return null;
  const { href, button } = view;
  return (
    <Card testID={`home-turn-${view.kind}`}>
      <Stack gap="12">
        <Text variant="body" singleLine={false}>
          {view.line}
        </Text>
        {button === null || href === undefined ? null : (
          <View style={{ alignSelf: 'flex-start' }}>
            <PillButton
              size="sm"
              tone="ink"
              variant={view.mine ? 'primary' : 'secondary'}
              label={upper(button, locale)}
              onPress={() => router.push(href)}
              testID="home-turn-button"
            />
          </View>
        )}
      </Stack>
    </Card>
  );
}
